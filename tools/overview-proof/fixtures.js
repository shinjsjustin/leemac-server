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

const schedule = () => ({ window: { start: '2026-11-02', end: '2026-11-29' }, board: [], undated: [] });

const ROUTES = {
  'GET /api/internal/job/overview': overviewData,
  'GET /api/internal/job/schedule': schedule,
  'GET /api/internal/badges': () => ({ active_parts: 3, new_requests: 0 }),
  'GET /api/internal/part/getblob': () => [],
};

// Returns { status, body } for a stubbed call, or null when no fixture exists.
function replyFor(method, url) {
  const route = ROUTES[`${method} ${url.split('?')[0]}`];
  return route ? { status: 200, body: route() } : null;
}

module.exports = { overviewData, replyFor };
