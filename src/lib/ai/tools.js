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
        content: { type: 'string', description: 'The to-do item text (max 500 chars)' },
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

  // ── PDF PARSER ───────────────────────────────────────────────────────────────

  {
    name: 'parse_pdf',
    description:
      'Parse a PDF (purchase order, quote, etc.) that has been uploaded to the session. ' +
      'Returns structured JSON with part numbers, quantities, prices, and PO fields.',
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
  update_nfc_status: 'auto',    // shop-floor status update — safe to auto-run
  propose_db_change: 'auto',    // this tool IS the approval gate; only writes to ai_approvals
  add_todo:          'auto',
  read_todos:        'auto',
  parse_pdf:         'auto',
};

module.exports = { TOOLS, PERMISSION_TIER };
