// src/lib/ai/tools.js
// Anthropic tool schemas for the orchestrator.
// Each tool maps to one or more backend endpoints or direct DB operations.

const { getTemplateKeys, getTemplateCatalog } = require('./requestTemplates');

const TOOLS = [
  // ── READ TIER ───────────────────────────────────────────────────────────────

  {
    name: 'read_jobs',
    description:
      'Get a paginated, sortable list of jobs with company name. ' +
      'Use this to browse or search the job list. Supports filtering by client/attention name.',
    input_schema: {
      type: 'object',
      properties: {
        page:      { type: 'integer', description: 'Page number, starting at 1 (default: 1)' },
        limit:     { type: 'integer', description: 'Results per page (default: 20, max: 100)' },
        attention: { type: 'string',  description: 'Filter by client / attention name' },
        sort:      { type: 'string',  description: 'Column to sort by (e.g. created_at, job_number)' },
        order:     { type: 'string',  enum: ['asc', 'desc'], description: 'Sort direction' },
      },
    },
  },

  {
    name: 'read_job_summary',
    description:
      'Get the full summary for a single job: job fields, company info, and all linked parts with pricing.',
    input_schema: {
      type: 'object',
      properties: {
        job_id: { type: 'integer', description: 'Internal job ID' },
      },
      required: ['job_id'],
    },
  },

  {
    name: 'read_parts',
    description:
      'Get all parts in the catalog with optional number/description filters.',
    input_schema: {
      type: 'object',
      properties: {
        number:      { type: 'string', description: 'Filter by part number (partial match)' },
        description: { type: 'string', description: 'Filter by part description (partial match)' },
      },
    },
  },

  {
    name: 'search_parts',
    description:
      'Search parts by number or description. Returns grouped results with job pricing history. ' +
      'Prefer this over read_parts when you have a search term.',
    input_schema: {
      type: 'object',
      properties: {
        q: { type: 'string', description: 'Search query — matched against part number and description' },
      },
      required: ['q'],
    },
  },

  {
    name: 'read_starred_jobs',
    description:
      'Get all currently starred (active shop-floor) job parts with full job, part, and company details. ' +
      'Use this to understand what is actively being worked on.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },

  {
    name: 'match_job_by_parts',
    description:
      'Find the job that fully matches a set of purchase-order line items when the PO has no job ' +
      'number. Supply the line items (part number, quantity, unit price) and the system returns the ' +
      'single job whose parts match exactly. A match is only returned when EVERY line item matches ' +
      'parts on the same job and that job contains exactly those parts (a complete, unambiguous ' +
      'match). If there is no full match, it returns matched:false with a reason — in that case do ' +
      'NOT guess a job; tell the user it could not be matched.',
    input_schema: {
      type: 'object',
      properties: {
        line_items: {
          type: 'array',
          description: 'The PO line items to match against existing jobs.',
          items: {
            type: 'object',
            properties: {
              part_number: { type: 'string', description: 'Part number from the PO' },
              quantity:    { type: 'number', description: 'Quantity from the PO' },
              price:       { type: 'number', description: 'Unit price from the PO (dollars)' },
            },
            required: ['part_number', 'quantity', 'price'],
          },
        },
      },
      required: ['line_items'],
    },
  },

  // ── NFC STATUS UPDATE (auto-approved per shop-floor workflow) ────────────────

  {
    name: 'update_nfc_status',
    description:
      'Update the production status of a starred job-part by its job_part_id. ' +
      'Valid status values include: open, in-progress, complete, on-hold, or any custom string.',
    input_schema: {
      type: 'object',
      properties: {
        job_part_id: { type: 'integer', description: 'The job_part ID to update' },
        status:      { type: 'string',  description: 'New production status string' },
      },
      required: ['job_part_id', 'status'],
    },
  },

  // ── APPROVAL QUEUE ───────────────────────────────────────────────────────────

  {
    name: 'propose_db_change',
    description:
      'Propose a write operation that requires human approval before it executes. ' +
      'Call this whenever you want to create, update, or delete business data. ' +
      'The action is queued in the Requests panel — it will NOT run until a human approves it.\n\n' +
      'You do NOT build URLs or pick HTTP methods. Instead you choose one of the hard-coded ' +
      'request `template` keys below and supply its `params`. The system fills in the exact ' +
      'endpoint, method, and body, so the request cannot be malformed. Only supply params that ' +
      'the chosen template defines.\n\n' +
      'Available templates:\n' +
      getTemplateCatalog(),
    input_schema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Short title shown in the Requests queue (e.g. "Create job #1425 for Acme Corp")',
        },
        description: {
          type: 'string',
          description: 'Human-readable explanation of what will happen and why',
        },
        template: {
          type: 'string',
          enum: getTemplateKeys(),
          description: 'The hard-coded request template key to use (see the list in this tool\'s description)',
        },
        params: {
          type: 'object',
          description:
            'Parameters for the chosen template. Must match exactly the params that the ' +
            'template defines — required params are mandatory, unknown params are rejected.',
        },
      },
      required: ['title', 'description', 'template', 'params'],
    },
  },

  // ── TODO LIST ────────────────────────────────────────────────────────────────

  {
    name: 'add_todo',
    description: 'Add a new item to the AI to-do list.',
    input_schema: {
      type: 'object',
      properties: {
        content:     { type: 'string', description: 'The to-do title — a short summary of what needs to be done (max 500 chars)' },
        description: { type: 'string', description: 'Optional longer detail for the task' },
      },
      required: ['content'],
    },
  },

  {
    name: 'read_todos',
    description: 'Read the current to-do list.',
    input_schema: {
      type: 'object',
      properties: {
        include_done: {
          type: 'boolean',
          description: 'If true, include completed items. Default: false (open items only)',
        },
      },
    },
  },

  // ── EMAIL (Gmail, read-only) ─────────────────────────────────────────────────

  {
    name: 'read_emails',
    description:
      'List recent Gmail messages for the owner with sender, subject, snippet, date, and ' +
      'attachment metadata. Use this to scan the inbox. Returns a short body preview only — ' +
      'call read_email for the full body of a specific message. ' +
      'Proactively offer to read or act on emails when the user mentions their inbox.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'Optional Gmail search query (same syntax as the Gmail search box, e.g. ' +
            '"from:acme is:unread", "has:attachment", "subject:invoice"). Omit for recent mail.',
        },
        since_hours: {
          type: 'integer',
          description: 'Only include mail from the last N hours (ignored if query is given). Default: 24',
        },
        max_results: {
          type: 'integer',
          description: 'Max messages to return (1–50, default 25)',
        },
      },
    },
  },

  {
    name: 'read_email',
    description:
      'Read one Gmail message in full: complete body text plus the list of attachments ' +
      '(filename, type, size, attachment_id). Use the attachment_id with read_email_attachment ' +
      'to read a PDF or text attachment. After reading an email, proactively consider whether it ' +
      'warrants a calendar event (create_calendar_event) or a follow-up to-do (add_todo).',
    input_schema: {
      type: 'object',
      properties: {
        email_id: { type: 'string', description: 'The Gmail message id (from read_emails)' },
      },
      required: ['email_id'],
    },
  },

  {
    name: 'read_email_attachment',
    description:
      'Download and read the contents of an email attachment. PDFs are first converted to Markdown ' +
      'with Microsoft MarkItDown and then parsed into structured JSON (part numbers, quantities, ' +
      'prices, PO fields) — the response includes both the structured fields and the document Markdown. ' +
      'Text-based attachments are returned as plain text. Other binary types return metadata only.',
    input_schema: {
      type: 'object',
      properties: {
        email_id:      { type: 'string', description: 'The Gmail message id' },
        attachment_id: { type: 'string', description: 'The attachment_id from read_email' },
      },
      required: ['email_id', 'attachment_id'],
    },
  },

  // ── CALENDAR (auto-create on the owner's primary calendar) ───────────────────

  {
    name: 'create_calendar_event',
    description:
      'Create a timed event on the owner\'s primary Google Calendar. This executes immediately. ' +
      'Proactively offer to schedule events when the conversation implies a deadline, meeting, ' +
      'delivery date, or follow-up — confirm the details in your reply after creating it.',
    input_schema: {
      type: 'object',
      properties: {
        summary:     { type: 'string', description: 'Event title' },
        start:       { type: 'string', description: 'Start time as an ISO 8601 datetime (America/Toronto assumed if no offset)' },
        end:         { type: 'string', description: 'End time as an ISO 8601 datetime. If omitted, defaults to 1 hour after start.' },
        description: { type: 'string', description: 'Optional event description / notes' },
        location:    { type: 'string', description: 'Optional location' },
      },
      required: ['summary', 'start'],
    },
  },

  // ── PDF PARSER ───────────────────────────────────────────────────────────────

  {
    name: 'parse_pdf',
    description:
      'Parse a PDF (purchase order, quote, etc.) that has been uploaded to the session. ' +
      'The PDF is converted to Markdown with Microsoft MarkItDown first, then a subagent extracts ' +
      'structured JSON with part numbers, quantities, prices, and PO fields. The response also ' +
      'includes the document Markdown so you can read its full text.',
    input_schema: {
      type: 'object',
      properties: {
        upload_id: {
          type: 'integer',
          description: 'ID from the ai_uploads table for the staged file to parse',
        },
      },
      required: ['upload_id'],
    },
  },
];

// ── Permission tiers ──────────────────────────────────────────────────────────
// 'auto'       – executor runs immediately, no human gate
// 'approval'   – executor queues to ai_approvals; human must approve before the action runs
// 'always_ask' – same as approval but flagged urgent; never auto-runs regardless of context
const PERMISSION_TIER = {
  read_jobs:         'auto',
  read_job_summary:  'auto',
  read_parts:        'auto',
  search_parts:      'auto',
  read_starred_jobs: 'auto',
  match_job_by_parts: 'auto',
  update_nfc_status: 'auto',    // shop-floor status update — safe to auto-run
  propose_db_change: 'auto',    // this tool IS the approval gate; only writes to ai_approvals
  add_todo:          'auto',
  read_todos:        'auto',
  parse_pdf:         'auto',
  read_emails:           'auto',
  read_email:            'auto',
  read_email_attachment: 'auto',
  create_calendar_event: 'auto', // owner explicitly opted into immediate calendar writes
};

module.exports = { TOOLS, PERMISSION_TIER };
