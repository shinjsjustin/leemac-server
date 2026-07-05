// src/lib/ai/requestTemplates.js
// Hard-coded write-request templates for Jarvis.
//
// Each template fixes the endpoint path + HTTP method so the AI can never
// fabricate an invalid route or method. Jarvis only chooses a template `key`
// and supplies `params`; this module validates the params and assembles the
// exact { endpoint, method, body } payload that the approval queue will run.
//
// Templates cover every JSON write endpoint in:
//   routes/job.js, routes/part.js, routes/notes.js,
//   routes/expense.js, routes/finances.js
// (Multipart file-upload endpoints are intentionally excluded — they cannot be
//  driven from a JSON proposal.)

// Mirror of the allow-lists enforced by the backend routes.
const VALID_STAR_STATUSES = [
  'open', 'urgent', 'waiting', 'done',
  'quoted', 'checking_stock', 'waiting_material', 'at_subvendor',
  'programming', 'setup', 'running_machine_a', 'running_machine_d',
  'running_manual', 'deburr_clean', 'qa', 'waiting_finish',
  'packing', 'delivered', 'invoiced',
];
const VALID_NOTE_STATUSES = ['new', 'acknowledged', 'done'];

// Param spec shape:
//   { type, required, path?, enum?, description }
//   - path: true  → value is substituted into the `:name` placeholder in `path`
//                   (otherwise the value goes into the request body)
const TEMPLATES = {
  // ── job.js ──────────────────────────────────────────────────────────────────
  create_job: {
    method: 'POST',
    path: '/api/internal/job/newjob',
    summary: 'Create a new job.',
    params: {
      jobNum:    { type: 'string',  required: true,  description: 'Job number' },
      companyId: { type: 'integer', required: true,  description: 'Company ID' },
      attention: { type: 'string',  required: false, description: 'Attention / client name' },
    },
  },
  update_job_po: {
    method: 'POST',
    path: '/api/internal/job/updatepo',
    summary: 'Update PO number, dates, and tax fields for a job.',
    params: {
      jobId:      { type: 'integer', required: true,  description: 'Job ID' },
      poNum:      { type: 'string',  required: true, description: 'PO number' },
      poDate:     { type: 'string',  required: false, description: 'PO date (YYYY-MM-DD)' },
      dueDate:    { type: 'string',  required: false, description: 'Due date (YYYY-MM-DD)' },
      taxCode:    { type: 'integer', required: true, description: 'Tax code: 1 if taxable, 0 if not' },
      tax:        { type: 'number',  required: false, description: 'Actual tax dollar amount from the PO. Prefer this whenever the PO shows a tax amount; saved to job.tax.' },
      taxPercent: { type: 'number',  required: false, description: 'Tax percent. Only use when the PO is taxable but shows no dollar amount.' },
    },
  },
  invoice_and_increment_job: {
    method: 'POST',
    path: '/api/internal/job/updateinvoiceandincrement',
    summary: 'Assign the next invoice number to a job and increment the global counter.',
    params: {
      jobId: { type: 'integer', required: true, description: 'Job ID' },
    },
  },
  link_part_to_job: {
    method: 'POST',
    path: '/api/internal/job/jobpartjoin',
    summary: 'Link a part to a job with quantity, price, revision, and details.',
    params: {
      jobId:    { type: 'integer', required: true,  description: 'Job ID' },
      partId:   { type: 'integer', required: true,  description: 'Part ID' },
      quantity: { type: 'integer', required: false, description: 'Quantity (default 1)' },
      price:    { type: 'number',  required: false, description: 'Unit price' },
      rev:      { type: 'string',  required: false, description: 'Revision' },
      details:  { type: 'string',  required: false, description: 'Details' },
    },
  },
  update_job_part_link: {
    method: 'POST',
    path: '/api/internal/job/updatejobpartjoin',
    summary: 'Update quantity, price, revision, details, and note for an existing job-part link.',
    params: {
      jobId:    { type: 'integer', required: true,  description: 'Job ID' },
      partId:   { type: 'integer', required: true,  description: 'Part ID' },
      quantity: { type: 'integer', required: true,  description: 'Quantity' },
      price:    { type: 'number',  required: false, description: 'Unit price' },
      rev:      { type: 'string',  required: false, description: 'Revision' },
      details:  { type: 'string',  required: false, description: 'Details' },
      note:     { type: 'string',  required: false, description: 'Note' },
    },
  },
  remove_part_from_job: {
    method: 'DELETE',
    path: '/api/internal/job/jobpartremove',
    summary: 'Remove a part from a job (delete the job-part link).',
    params: {
      jobId:  { type: 'integer', required: true, description: 'Job ID' },
      partId: { type: 'integer', required: true, description: 'Part ID' },
    },
  },
  set_current_job_number: {
    method: 'POST',
    path: '/api/internal/job/updatejobnum',
    summary: 'Update the current job number counter.',
    params: {
      number: { type: 'string', required: true, description: 'New job number counter value' },
    },
  },
  set_job_status_config: {
    method: 'POST',
    path: '/api/internal/job/status',
    summary: 'Update the job status configuration JSON object in metadata.',
    params: {
      job_status: { type: 'object', required: true, description: 'Job status configuration object' },
    },
  },
  star_job_part: {
    method: 'POST',
    path: '/api/internal/job/starjob',
    summary: 'Star a job-part for active shop-floor tracking, tagged to a client.',
    params: {
      jobPartId: { type: 'integer', required: true, description: 'Job-part ID' },
      attention: { type: 'string',  required: true, description: 'Client / attention name' },
    },
  },
  unstar_job_part: {
    method: 'DELETE',
    path: '/api/internal/job/unstarjob',
    summary: 'Unstar a job-part from active tracking.',
    params: {
      jobPartId: { type: 'integer', required: true, description: 'Job-part ID' },
    },
  },
  // pair_nfc_tag: {
  //   method: 'PUT',
  //   path: '/api/internal/job/pairnfctag',
  //   summary: 'Pair an NFC tag ID to a starred job-part.',
  //   params: {
  //     jobPartId: { type: 'integer', required: true, description: 'Job-part ID' },
  //     nfcTagId:  { type: 'string',  required: true, description: 'NFC tag ID' },
  //   },
  // },
  // unpair_nfc_tag: {
  //   method: 'PUT',
  //   path: '/api/internal/job/unpairnfctag',
  //   summary: 'Clear the NFC tag association from a starred job-part.',
  //   params: {
  //     jobPartId: { type: 'integer', required: true, description: 'Job-part ID' },
  //   },
  // },
  // update_star_status_by_nfc: {
  //   method: 'PUT',
  //   path: '/api/internal/job/updatestarstatusbynfctag',
  //   summary: 'Update the production status of a starred job-part by its NFC tag.',
  //   params: {
  //     nfcTagId: { type: 'string', required: true, description: 'NFC tag ID' },
  //     status:   { type: 'string', required: true, enum: VALID_STAR_STATUSES, description: 'New production status' },
  //   },
  // },
  update_star_status_by_job_part: {
    method: 'PUT',
    path: '/api/internal/job/updatestarjobstatus',
    summary: 'Update the production status of a starred job-part by its job-part ID.',
    params: {
      jobPartId: { type: 'integer', required: true, description: 'Job-part ID' },
      status:    { type: 'string',  required: true, enum: VALID_STAR_STATUSES, description: 'New production status' },
    },
  },
  update_star_status_by_job_number: {
    method: 'PUT',
    path: '/api/internal/job/updatestarstatusbyjobnumber',
    summary: 'Update the production status of a starred job-part by job number and part number.',
    params: {
      jobNumber:  { type: 'string', required: true, description: 'Job number' },
      partNumber: { type: 'string', required: true, description: 'Part number' },
      status:     { type: 'string', required: true, enum: VALID_STAR_STATUSES, description: 'New production status' },
    },
  },
  // calculate_job_cost: {
  //   method: 'POST',
  //   path: '/api/internal/job/calculatecost',
  //   summary: 'Calculate and save subtotal and total cost (with tax) for a job from its parts.',
  //   params: {
  //     jobId: { type: 'integer', required: true, description: 'Job ID' },
  //   },
  // },

  // ── part.js ─────────────────────────────────────────────────────────────────
  create_part: {
    method: 'POST',
    path: '/api/internal/part/newpart',
    summary: 'Create a new part (returns existing ID if the part number already exists).',
    params: {
      number:      { type: 'string', required: true,  description: 'Part number' },
      description: { type: 'string', required: false, description: 'Part description' },
    },
  },
  update_part: {
    method: 'POST',
    path: '/api/internal/part/updatepart',
    summary: "Update a part's number and description by ID.",
    params: {
      id:          { type: 'integer', required: true,  description: 'Part ID' },
      number:      { type: 'string',  required: false, description: 'Part number' },
      description: { type: 'string',  required: false, description: 'Part description' },
    },
  },
  delete_part: {
    method: 'DELETE',
    path: '/api/internal/part/deletepart',
    summary: 'Delete a part and cascade-delete its uploaded files. (Sent as ?id= query.)',
    params: {
      id: { type: 'integer', required: true, query: true, description: 'Part ID' },
    },
  },
  delete_part_file: {
    method: 'DELETE',
    path: '/api/internal/part/deleteblob',
    summary: 'Delete a part file attachment by file ID. (Sent as ?fileID= query.)',
    params: {
      fileID: { type: 'integer', required: true, query: true, description: 'Uploaded file ID' },
    },
  },

  // ── notes.js ────────────────────────────────────────────────────────────────
  create_note: {
    method: 'POST',
    path: '/api/internal/notes/newnote',
    summary: 'Create a new note for a job, linked to an admin user.',
    params: {
      content: { type: 'string',  required: true, description: 'Note content' },
      userid:  { type: 'integer', required: true, description: 'Admin user ID' },
      jobid:   { type: 'integer', required: true, description: 'Job ID' },
    },
  },
  update_note_status: {
    method: 'PUT',
    path: '/api/internal/notes/updatestatus',
    summary: 'Update the status of a note.',
    params: {
      id:     { type: 'integer', required: true, description: 'Note ID' },
      status: { type: 'string',  required: true, enum: VALID_NOTE_STATUSES, description: 'New note status' },
    },
  },
  delete_note: {
    method: 'DELETE',
    path: '/api/internal/notes/delete',
    summary: 'Delete a note by ID.',
    params: {
      id: { type: 'integer', required: true, description: 'Note ID' },
    },
  },

  // ── expense.js ──────────────────────────────────────────────────────────────
  create_expense: {
    method: 'POST',
    path: '/api/internal/expenses/create',
    summary: 'Create a new expense, optionally linked to jobs and/or financial periods.',
    params: {
      description:  { type: 'string',  required: true,  description: 'Expense description' },
      amount:       { type: 'number',  required: true,  description: 'Amount' },
      expense_date: { type: 'string',  required: true,  description: 'Expense date (YYYY-MM-DD)' },
      vendor:       { type: 'string',  required: false, description: 'Vendor' },
      category:     { type: 'string',  required: false, description: 'Category' },
      notes:        { type: 'string',  required: false, description: 'Notes' },
      jobIds:       { type: 'array',   required: false, description: 'Job IDs to link' },
      periodIds:    { type: 'array',   required: false, description: 'Financial period IDs to link' },
    },
  },
  update_expense: {
    method: 'PUT',
    path: '/api/internal/expenses/update/:id',
    summary: "Edit an existing expense's fields.",
    params: {
      id:           { type: 'integer', required: true,  path: true, description: 'Expense ID' },
      description:  { type: 'string',  required: true,  description: 'Expense description' },
      amount:       { type: 'number',  required: true,  description: 'Amount' },
      expense_date: { type: 'string',  required: true,  description: 'Expense date (YYYY-MM-DD)' },
      vendor:       { type: 'string',  required: false, description: 'Vendor' },
      category:     { type: 'string',  required: false, description: 'Category' },
      notes:        { type: 'string',  required: false, description: 'Notes' },
    },
  },
  delete_expense: {
    method: 'DELETE',
    path: '/api/internal/expenses/delete/:id',
    summary: 'Delete an expense by ID.',
    params: {
      id: { type: 'integer', required: true, path: true, description: 'Expense ID' },
    },
  },
  link_expense_to_jobs: {
    method: 'POST',
    path: '/api/internal/expenses/linkjobs/:expenseId',
    summary: 'Link an existing expense to one or more jobs.',
    params: {
      expenseId: { type: 'integer', required: true, path: true, description: 'Expense ID' },
      jobIds:    { type: 'array',   required: true, description: 'Job IDs to link' },
    },
  },
  unlink_expense_from_job: {
    method: 'DELETE',
    path: '/api/internal/expenses/unlinkjob',
    summary: 'Remove the link between an expense and a job.',
    params: {
      expenseId: { type: 'integer', required: true, description: 'Expense ID' },
      jobId:     { type: 'integer', required: true, description: 'Job ID' },
    },
  },
  link_expense_to_periods: {
    method: 'POST',
    path: '/api/internal/expenses/linkperiods/:expenseId',
    summary: 'Link an existing expense to one or more financial periods.',
    params: {
      expenseId: { type: 'integer', required: true, path: true, description: 'Expense ID' },
      periodIds: { type: 'array',   required: true, description: 'Financial period IDs to link' },
    },
  },
  unlink_expense_from_period: {
    method: 'DELETE',
    path: '/api/internal/expenses/unlinkperiod',
    summary: 'Remove the link between an expense and a financial period.',
    params: {
      expenseId: { type: 'integer', required: true, description: 'Expense ID' },
      periodId:  { type: 'integer', required: true, description: 'Financial period ID' },
    },
  },

  // ── finances.js ─────────────────────────────────────────────────────────────
  create_financial_period: {
    method: 'POST',
    path: '/api/internal/finances/periods',
    summary: 'Create a new financial period.',
    params: {
      lable:      { type: 'string',  required: true, description: 'Period label' },
      quarter:    { type: 'integer', required: true, description: 'Quarter (1-4)' },
      year:       { type: 'integer', required: true, description: 'Year' },
      start_date: { type: 'string',  required: true, description: 'Start date (YYYY-MM-DD)' },
      end_date:   { type: 'string',  required: true, description: 'End date (YYYY-MM-DD)' },
    },
  },
  update_financial_period: {
    method: 'PUT',
    path: '/api/internal/finances/periods/:id',
    summary: 'Update an existing financial period by ID.',
    params: {
      id:         { type: 'integer', required: true, path: true, description: 'Financial period ID' },
      lable:      { type: 'string',  required: true, description: 'Period label' },
      quarter:    { type: 'integer', required: true, description: 'Quarter (1-4)' },
      year:       { type: 'integer', required: true, description: 'Year' },
      start_date: { type: 'string',  required: true, description: 'Start date (YYYY-MM-DD)' },
      end_date:   { type: 'string',  required: true, description: 'End date (YYYY-MM-DD)' },
    },
  },
  delete_financial_period: {
    method: 'DELETE',
    path: '/api/internal/finances/periods/:id',
    summary: 'Delete a financial period by ID.',
    params: {
      id: { type: 'integer', required: true, path: true, description: 'Financial period ID' },
    },
  },
  set_current_financial_period: {
    method: 'POST',
    path: '/api/internal/finances/updatefinancialperiod',
    summary: 'Set the current active financial period in metadata.',
    params: {
      periodId: { type: 'integer', required: true, description: 'Financial period ID' },
    },
  },
  assign_job_to_period: {
    method: 'POST',
    path: '/api/internal/finances/periods/:id/jobs',
    summary: 'Assign a single job to a financial period.',
    params: {
      id:     { type: 'integer', required: true, path: true, description: 'Financial period ID' },
      job_id: { type: 'integer', required: true, description: 'Job ID' },
    },
  },
  remove_job_from_period: {
    method: 'DELETE',
    path: '/api/internal/finances/periods/:id/jobs/:jobId',
    summary: 'Remove a specific job from a financial period.',
    params: {
      id:    { type: 'integer', required: true, path: true, description: 'Financial period ID' },
      jobId: { type: 'integer', required: true, path: true, description: 'Job ID' },
    },
  },
  clear_period_jobs: {
    method: 'DELETE',
    path: '/api/internal/finances/periods/:id/jobs',
    summary: 'Remove all jobs from a financial period.',
    params: {
      id: { type: 'integer', required: true, path: true, description: 'Financial period ID' },
    },
  },
  assign_jobs_to_period_bulk: {
    method: 'POST',
    path: '/api/internal/finances/periods/:id/jobs/bulk',
    summary: 'Bulk assign an array of job IDs to a financial period.',
    params: {
      id:      { type: 'integer', required: true, path: true, description: 'Financial period ID' },
      job_ids: { type: 'array',   required: true, description: 'Job IDs to assign' },
    },
  },
  assign_jobs_to_period_by_range: {
    method: 'POST',
    path: '/api/internal/finances/periods/:id/jobs/range',
    summary: 'Bulk assign jobs to a financial period by invoice number range (inclusive).',
    params: {
      id:           { type: 'integer', required: true, path: true, description: 'Financial period ID' },
      invoice_from: { type: 'integer', required: true, description: 'Starting invoice number' },
      invoice_to:   { type: 'integer', required: true, description: 'Ending invoice number' },
    },
  },
  assign_expense_to_period: {
    method: 'POST',
    path: '/api/internal/finances/periods/:id/expenses',
    summary: 'Assign a single expense to a financial period.',
    params: {
      id:         { type: 'integer', required: true, path: true, description: 'Financial period ID' },
      expense_id: { type: 'integer', required: true, description: 'Expense ID' },
    },
  },
  remove_expense_from_period: {
    method: 'DELETE',
    path: '/api/internal/finances/periods/:id/expenses/:expenseId',
    summary: 'Remove an expense from a financial period.',
    params: {
      id:        { type: 'integer', required: true, path: true, description: 'Financial period ID' },
      expenseId: { type: 'integer', required: true, path: true, description: 'Expense ID' },
    },
  },
  assign_expenses_to_period_bulk: {
    method: 'POST',
    path: '/api/internal/finances/periods/:id/expenses/bulk',
    summary: 'Bulk assign an array of expense IDs to a financial period.',
    params: {
      id:          { type: 'integer', required: true, path: true, description: 'Financial period ID' },
      expense_ids: { type: 'array',   required: true, description: 'Expense IDs to assign' },
    },
  },

  // ── Quote jobs ───────────────────────────────────────────────────────────────
  // `create_quote_job` is the ONE-SHOT quote-job template: it creates the job,
  // reuses/creates every part, and links them in a single atomic request. It is
  // used two ways:
  //   1. Interactively — the orchestrator picks it directly via propose_db_change
  //      whenever the owner asks to make a quote/job with parts. Preferring this
  //      single template avoids the 7-10 individual create_job/create_part/
  //      link_part_to_job calls it would otherwise chain together.
  //   2. Automatically — the rfqIntake module assembles it from a verified email
  //      RFQ extraction.
  //
  // `extract_quote_part` is flagged `internal: true` so it is EXCLUDED from the
  // orchestrator's propose_db_change tool — it has NO API endpoint and is a
  // verification SCHEMA only. The Bezalel/Moses loop reads its `params`/`summary`
  // to extract + verify part fields from MarkItDown text; buildRequestFromTemplate
  // is never called on it. It stays tiered in agents/stakes.js and readable by the
  // verifier loop (both read TEMPLATES[key] regardless of the internal flag).
  extract_quote_part: {
    internal: true,
    method: null,
    path: null,
    summary: 'Extract the fields for ONE quote part from a drawing converted to text by MarkItDown.',
    params: {
      part_number: { type: 'string',  required: true,  description: 'The part number from the drawing (title block / part-number field).' },
      description: { type: 'string',  required: false, description: 'The drawing title / part description.' },
      material:    { type: 'string',  required: false, description: 'The single raw-material callout (e.g. "AL 6061", "SS 304"). At most one; null if none is stated.' },
      finish:      { type: 'string',  required: false, description: 'The single surface-finish PROCESS only (e.g. clear anodize, passivate, hard anodize). Never deburr/cleaning. Null if none is stated.' },
      quantity:    { type: 'integer', required: true,  description: 'Quantity requested for this part.' },
    },
  },
  create_quote_job: {
    method: 'POST',
    path: '/api/internal/job/createquotejob',
    summary: 'ONE-SHOT quote job: allocate the next job number, reuse/create every part, and link them all in a single atomic request (price hardcoded to $1 by the endpoint). PREFER this over create_job + create_part + link_part_to_job when making a job with parts.',
    params: {
      company_id: { type: 'integer', required: true,  description: 'Resolved company ID (look up the company first; never guess it).' },
      attention:  { type: 'string',  required: false, description: 'Client / attention name.' },
      parts:      { type: 'array',   required: true,  description: 'Array of parts: each { part_number, description, material, finish, quantity }. part_number and quantity are required per part.' },
    },
  },
};

// ── Build + validate ───────────────────────────────────────────────────────────
// Resolves a template key + raw params into a concrete { endpoint, method, body }.
// Throws a descriptive Error if the template is unknown or params are invalid,
// so the orchestrator can surface the problem and retry.

function buildRequestFromTemplate(templateKey, rawParams = {}) {
  const tpl = TEMPLATES[templateKey];
  if (!tpl) {
    throw new Error(
      `Unknown request template: "${templateKey}". ` +
      `Valid templates: ${Object.keys(TEMPLATES).join(', ')}`
    );
  }

  const params = rawParams && typeof rawParams === 'object' ? rawParams : {};
  const errors = [];
  const body = {};
  const queryParams = {};
  let endpoint = tpl.path;

  for (const [name, spec] of Object.entries(tpl.params)) {
    const value = params[name];
    const provided = value !== undefined && value !== null && value !== '';

    if (spec.required && !provided) {
      errors.push(`missing required param "${name}" (${spec.description})`);
      continue;
    }
    if (!provided) continue;

    if (spec.enum && !spec.enum.includes(value)) {
      errors.push(`invalid value for "${name}": "${value}" — allowed: ${spec.enum.join(', ')}`);
      continue;
    }

    if (spec.path) {
      endpoint = endpoint.replace(`:${name}`, encodeURIComponent(value));
    } else if (spec.query) {
      queryParams[name] = value;
    } else {
      body[name] = value;
    }
  }

  // Reject any param the template does not define.
  for (const name of Object.keys(params)) {
    if (!tpl.params[name]) {
      errors.push(`unknown param "${name}" for template "${templateKey}"`);
    }
  }

  if (errors.length) {
    throw new Error(`Template "${templateKey}" validation failed: ${errors.join('; ')}`);
  }

  if (endpoint.includes('/:')) {
    throw new Error(`Template "${templateKey}" still has unresolved path parameters: ${endpoint}`);
  }

  const qs = new URLSearchParams(queryParams).toString();
  if (qs) endpoint += `?${qs}`;

  return { endpoint, method: tpl.method, body };
}

// Stable list of ALL template keys, including internal ones. Used by
// agents/stakes.js so every template (internal or not) is tiered and verifiable.
function getTemplateKeys() {
  return Object.keys(TEMPLATES);
}

// Public template keys only (internal templates excluded). Used to constrain the
// orchestrator's propose_db_change tool schema enum so the model can never pick
// an internal/RFQ-only template directly.
function getPublicTemplateKeys() {
  return Object.keys(TEMPLATES).filter((key) => !TEMPLATES[key].internal);
}

// Human-readable catalog injected into the tool description so the model knows
// exactly which templates exist and what each one needs.
function getTemplateCatalog() {
  return Object.entries(TEMPLATES)
    .filter(([, tpl]) => !tpl.internal)
    .map(([key, tpl]) => {
      const paramList = Object.entries(tpl.params)
        .map(([name, spec]) => {
          const flag = spec.required ? 'required' : 'optional';
          const enumStr = spec.enum ? ` {${spec.enum.join('|')}}` : '';
          return `${name} (${spec.type}, ${flag})${enumStr}`;
        })
        .join(', ');
      return `- ${key}: ${tpl.summary}\n    params: ${paramList || 'none'}`;
    })
    .join('\n');
}

module.exports = {
  TEMPLATES,
  buildRequestFromTemplate,
  getTemplateKeys,
  getPublicTemplateKeys,
  getTemplateCatalog,
  VALID_STAR_STATUSES,
  VALID_NOTE_STATUSES,
};
