const { clientReply } = require('./clientFixtures');

const STATUSES = [
  'running_machine_a', 'running_machine_d', 'running_manual', 'checking_stock', 'waiting_material',
  'programming', 'setup', 'at_subvendor', 'waiting_finish', 'deburr_clean', 'qa', 'packing',
];
const JOB_COUNT = 5;
const PARTS_PER_JOB = 6;
const COMPANIES = ['Acme', 'Beta Tools', 'Cobalt', 'Delta Aero', 'Echo Medical'];
const CONTACTS = ['Kim', 'Lee'];

function buildPart(jobIndex, partIndex) {
  const n = jobIndex * PARTS_PER_JOB + partIndex;
  return {
    job_part_id: 1000 + n,
    part_id: 500 + n,
    number: `HSX${jobIndex}-${String(870 + partIndex).padStart(4, '0')}`,
    rev: 'C',
    description: 'Bracket, mounting',
    material: '6061-T6',
    finish: 'Anodize',
    quantity: 10 + n,
    price: 12.5 + n,
    status: STATUSES[n % STATUSES.length],
    urgent: n % 7 === 0,
    waiting: n % 5 === 0,
    since: '2026-11-04T14:30:00Z',
    paired: false,
    notes: [],
    attention: CONTACTS[jobIndex % CONTACTS.length],
  };
}

function overviewData() {
  const jobs = Array.from({ length: JOB_COUNT }, (_, j) => ({
    id: 100 + j,
    job_number: String(13800 + j),
    company_name: COMPANIES[j],
    attention: CONTACTS[j % CONTACTS.length],
    po_number: `PO${j}`,
    invoice_number: null,
    parts: Array.from({ length: PARTS_PER_JOB }, (__, p) => buildPart(j, p)),
  }));
  const total = jobs.reduce((sum, job) => sum + job.parts.length, 0);
  return {
    headline: { active_parts: total, open_value: 25000, due_soon: 3, overdue: 1, invoices_waiting: { count: 2, total: 900 } },
    contacts: CONTACTS.map((attention) => ({ attention, count: total / CONTACTS.length })),
    jobs,
  };
}

const FIRST_FIXTURE_PART_ID = 9000;
const LONG_UNBROKEN = 'ANODIZE-TYPE-II-CLASS-2-BLACK-PER-MIL-A-8625-WITH-SEALED-DICHROMATE-AND-LOT-TRACEABILITY-0123456789';
const LONG_SUBJECT = 'Re: Revised drawings and updated purchase order for the machined bracket assemblies, please confirm lead time and finish before Friday';
const A_FEW_FILES = [];

// A one-page PDF whose xref offsets are computed so any reader accepts it.
function tinyPdf() {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets = objects.map((body, i) => {
    const at = out.length;
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
    return at;
  });
  const xrefAt = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  out += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  return Buffer.from(out).toString('base64');
}

function fixtureBlob(params) {
  if (Number(params.get('partID')) < FIRST_FIXTURE_PART_ID) return [];
  return [{ id: 7001, filename: 'bracket.pdf', mimetype: 'application/pdf', content: tinyPdf() }];
}

const jobSummary = () => ({
  job: {
    id: 100, job_number: '13800', company_name: 'Acme', attention: 'Kim', po_number: 'PO0', po_date: '2026-10-01',
    due_date: '2026-11-20', created_at: '2026-10-01T00:00:00Z', invoice_number: null, invoice_date: null,
    tax: 0, tax_code: null, tax_percent: 0, subtotal: 1200, total_cost: 1200,
  },
  parts: [0, 1, 2].map((i) => ({
    id: FIRST_FIXTURE_PART_ID + i,
    job_part_id: 3000 + i,
    number: `HSX-BRACKET-${9000 + i}`,
    description: 'Mounting bracket, machined from bar stock',
    rev: 'C',
    details: LONG_UNBROKEN,
    material: LONG_UNBROKEN,
    finish: LONG_UNBROKEN,
    stock_size: LONG_UNBROKEN,
    price: 12.5 + i,
    quantity: 10,
    note: LONG_UNBROKEN,
  })),
});

const jobStages = () => ({ stages: [3000, 3001, 3002].map((id) => ({ job_part_id: id, starred: id !== 3002, status: 'setup' })) });

const emails = () => ({
  emails: [1, 2].map((id) => ({
    id, message_id: `<msg-${id}@example.com>`, subject: `${LONG_SUBJECT} (${id})`, from: 'buyer@example.com', date: '2026-11-03',
  })),
});

const partLists = () => [
  { id: 1, name: 'Brackets', part_ids: [9000, 9001], owner: 'proof' },
  { id: 2, name: 'Spares', part_ids: [9002], owner: 'proof' },
];

const partRows = () => [0, 1, 2].map((i) => ({
  id: FIRST_FIXTURE_PART_ID + i,
  number: `HSX-BRACKET-${9000 + i}`,
  description: 'Mounting bracket, machined from bar stock',
  latest_drawing: null,
  drawing_count: 0,
}));

const schedule = () => ({ window: { start: '2026-11-02', end: '2026-11-29' }, board: [], undated: [] });

const printable = (type, label, reason = null) => ({ type, label, file_id: reason ? null : 5, filename: `${type}.pdf`, reason });
const printables = () => ({
  documents: [
    printable('quote', 'Quote'),
    printable('order', 'Order', 'Not made yet'),
    printable('invoice', 'Invoice', 'Click Update invoice first'),
    printable('packing', 'Packing list', 'Click Update invoice first'),
    printable('shipping', 'Shipping label', 'Click Update invoice first'),
  ],
  drawings: 6,
});

const ROUTES = {
  'GET /api/internal/print/job': printables,
  'DELETE /api/internal/job/unstarjob': () => ({}),
  'GET /api/internal/job/overview': overviewData,
  'GET /api/internal/job/schedule': schedule,
  'GET /api/internal/badges': () => ({ active_parts: 3, new_requests: 0 }),
  'GET /api/internal/part/getblob': (params) => fixtureBlob(params),
  'GET /api/internal/job/jobsummary': jobSummary,
  'GET /api/internal/job/jobstages': jobStages,
  'GET /api/internal/job/checkjobstarred': () => ({ isStarred: false }),
  'GET /api/internal/job/files': () => A_FEW_FILES,
  'GET /api/internal/job/documents': () => ({}),
  'GET /api/internal/expenses/byjob/100': () => A_FEW_FILES,
  'GET /api/internal/notes/getnote': () => A_FEW_FILES,
  'GET /api/internal/emails': emails,
  'GET /api/internal/part/getpart': () => ({ number: 'HSX-BRACKET-9000', description: 'Mounting bracket, machined from bar stock' }),
  'GET /api/internal/part/getjobs': () => A_FEW_FILES,
  'GET /api/internal/part/getparts': partRows,
  'GET /api/internal/part-lists': partLists,
};

// Returns { status, body } for a stubbed call, or null when no fixture exists.
function replyFor(method, url) {
  const [path, query = ''] = url.split('?');
  const route = ROUTES[`${method} ${path}`];
  return route ? { status: 200, body: route(new URLSearchParams(query)) } : clientReply(method, url);
}

module.exports = { overviewData, replyFor };
