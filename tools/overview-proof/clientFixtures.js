// Realistic, deliberately long client-portal data: the overview is measured against it.
const JOB_COUNT = 24;
const PARTS_PER_JOB = 9;
const PART_POOL = 30;
const MS_PER_DAY = 86400000;
const SCHEDULE_START_OFFSET_DAYS = -7;
const SCHEDULE_DAYS = 28;
const NOTE_ID_NEW = 900;
const STAGES = [
  { key: 'open', label: 'Open' },
  { key: 'machining', label: 'Machining' },
  { key: 'outside_finishing', label: 'Outside finishing' },
  { key: 'inspection', label: 'Inspection' },
  { key: 'packing', label: 'Packing' },
  { key: 'shipped', label: 'Shipped' },
];
const FLAGS = [null, 'due_soon', null, 'overdue', null];
const COMPANIES = [
  'Northwest Precision Aerospace Components and Assemblies Incorporated',
  'Cobalt Ridge Medical Devices',
  'Delta Hydraulics',
];
const AUTHORS = ['Priya Venkataraman-Holloway', 'Sam Ortiz', 'Dana Whitfield'];
const LONG_NOTE = 'Please confirm the anodize colour against the last order before this lot ships; the print calls out Type II class 2 black.';

const day = (offset) => new Date(Date.now() + offset * MS_PER_DAY).toISOString().slice(0, 10);
const stageAt = (n) => STAGES[n % STAGES.length];
const partNumber = (n) => `HSX-ALUMINUM-BRACKET-ASSEMBLY-${String(1000 + n)}`;
const jobNumber = (j) => `J-2026-${String(13800 + j)}-REV-B`;

function buildJobPart(j, p) {
  const n = j * PARTS_PER_JOB + p;
  const partId = 500 + (n % PART_POOL);
  return {
    job_part_id: 1000 + n,
    part_id: partId,
    part_number: partNumber(partId - 500),
    rev: p % 3 === 0 ? null : String.fromCharCode(65 + (p % 4)),
    part_description: 'Mounting bracket, machined from 6061-T6 bar stock, deburred all edges, anodize black',
    quantity: 10 + n,
    material: '6061-T6 aluminum',
    finish: 'Black anodize Type II',
    stage: stageAt(n),
  };
}

function buildJob(j) {
  const parts = Array.from({ length: PARTS_PER_JOB }, (_, p) => buildJobPart(j, p));
  return {
    id: 100 + j,
    job_number: jobNumber(j),
    po_number: `PO-NORTHWEST-AEROSPACE-${70000 + j}`,
    po_date: day(-30 + j),
    due_date: j % 6 === 5 ? null : day(j - 6),
    ship_date: null,
    stage: stageAt(j),
    flag: FLAGS[j % FLAGS.length],
    parts: parts.map(({ job_part_id, part_id, stage }) => ({ job_part_id, part_id, stage })),
    detail: parts,
  };
}

const JOBS = Array.from({ length: JOB_COUNT }, (_, j) => buildJob(j));
const summary = ({ detail, ...job }) => job;

function jobDetail(id) {
  const job = JOBS.find((candidate) => candidate.id === id);
  if (!job) return null;
  const { detail, ...rest } = job;
  return { ...rest, parts: detail, charges: detail.slice(0, 2) };
}

function overview() {
  return {
    headline: { active_jobs: JOB_COUNT, due_soon: 5, overdue: 3, on_time_rate: 91, parts_in_shop: 120, next_due: day(2), shipped_on_time: 52, shipped_total: 57 },
    jobs: JOBS.map(summary),
    requests: Array.from({ length: 4 }, (_, i) => ({
      id: 20 + i,
      name: 'Quote for revised mounting bracket family, three sizes, with certs',
      status: ['sent', 'quoted', 'in_review', 'sent'][i],
      submitted_at: new Date(Date.now() - (i + 1) * MS_PER_DAY).toISOString(),
      line_count: 3 + i,
      need_by: i % 2 ? day(20) : null,
    })),
    parts: Array.from({ length: PART_POOL }, (_, i) => ({
      part_id: 500 + i,
      part_number: partNumber(i),
      part_description: 'Mounting bracket',
      jobs: [{ id: 100 + i % JOB_COUNT, job_number: jobNumber(i % JOB_COUNT) }],
      drawings: [],
    })),
    lists: [
      { id: 1, name: 'Aerospace brackets, recurring monthly order', part_ids: [500, 501, 502, 503] },
      { id: 2, name: 'Prototype runs', part_ids: [504, 505] },
      { id: 3, name: 'Empty list', part_ids: [] },
    ],
  };
}

function schedule() {
  const board = JOBS.slice(0, 14).map((job, i) => ({
    id: job.id,
    job_number: job.job_number,
    company_name: COMPANIES[i % COMPANIES.length],
    stage: STAGES[Math.floor(i / 3) % STAGES.length],
    flag: job.flag,
    own: i % 4 !== 3,
    part_count: PARTS_PER_JOB,
    created_at: day(-20 + i),
    due_date: job.due_date ?? day(10 + i),
  }));
  return {
    window: { start: day(SCHEDULE_START_OFFSET_DAYS), end: day(SCHEDULE_START_OFFSET_DAYS + SCHEDULE_DAYS - 1) },
    board,
    undated: [{ id: JOBS[5].id, job_number: JOBS[5].job_number, company_name: COMPANIES[0], stage: STAGES[0], flag: null }],
  };
}

function ticker() {
  return Array.from({ length: 40 }, (_, i) => ({
    at: new Date(Date.now() - i * 3600000).toISOString(),
    job_number: jobNumber(i % JOB_COUNT),
    part_number: partNumber(i % PART_POOL),
    own: i % 5 !== 4,
    stage: stageAt(i),
  }));
}

const note = (id, n, content) => ({
  id,
  author: AUTHORS[n % AUTHORS.length],
  is_client: n % 3 !== 0,
  content,
  created_at: new Date(Date.now() - n * 3600000).toISOString(),
});

const PROOF_PART = { id: 9000, number: 'HSX-BRACKET-9000', drawingId: 9100 };
const PROOF_STEPS = ['1. Saw bar stock to length', '2. Mill the pockets and drill the holes', '3. Deburr all edges', '4. Black anodize, Type II'].join('\n');
// Part notes carry the part they belong to, so a job thread can tag them.
const partNote = (id, n, content) => ({ ...note(id, n, content), part_id: PROOF_PART.id, part_number: PROOF_PART.number });

function notes() {
  return {
    jobs: {
      100: [note(1, 1, LONG_NOTE), note(2, 2, 'Thanks, confirmed.'), note(3, 3, 'Shipping Friday.')],
      101: [note(4, 4, LONG_NOTE), partNote(8, 8, 'Please check the hole spacing on this bracket.')],
    },
    parts: {
      500: [note(5, 5, 'Rev B drawing attached.'), note(6, 6, LONG_NOTE)],
      [PROOF_PART.id]: [partNote(7, 6, 'Hole spacing confirmed against the drawing.'), partNote(9, 7, 'Thanks, please start the run.')],
    },
  };
}

// A one-page PDF built like tinyPdf in fixtures.js (which requires this file, so it can't be shared).
function onePagePdfBase64() {
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

function proofPart() {
  return {
    part_id: PROOF_PART.id,
    part_number: PROOF_PART.number,
    part_description: 'Mounting bracket, machined from 6061-T6 bar stock',
    process_steps: PROOF_STEPS,
    facts: { rev: 'B', material: '6061-T6 aluminum', finish: 'Black anodize Type II' },
    jobs: [{ id: 101, job_number: jobNumber(1), quantity: 25, po_date: day(-29) }],
    drawings: [{ id: PROOF_PART.drawingId, filename: 'bracket.pdf', mimetype: 'application/pdf', size: 2048, uploaded_at: day(-30) }],
  };
}

const jobList = ({ limit, offset }) => ({
  jobs: JOBS.slice(offset, offset + limit).map(summary),
  pagination: { total: JOBS.length, limit, offset, hasMore: offset + limit < JOBS.length },
});

// Parts have STEP models but no drawings, so no tile asks for a file.
const partFiles = (partId) => (partId % 2 ? [{ id: partId * 10, filename: `bracket-${partId}.step`, mimetype: 'model/step' }] : []);

const ID_ROUTES = [
  ['PUT', /^\/api\/portal-notes\/(\d+)$/, (id) => ({ id })],
  ['GET', /^\/api\/portal\/jobs\/(\d+)$/, (id) => jobDetail(id)],
  ['GET', /^\/api\/portal\/parts\/(\d+)\/files$/, (id) => partFiles(id)],
  ['GET', /^\/api\/portal\/parts\/(\d+)$/, (id) => (id === PROOF_PART.id ? proofPart() : null)],
  ['GET', /^\/api\/portal-qc\/parts\/(\d+)$/, (id) => (id === PROOF_PART.id ? { markings: [], photos: [] } : null)],
  ['GET', /^\/api\/portal\/files\/(\d+)$/, (id) => (id === PROOF_PART.drawingId ? { mimetype: 'application/pdf', content: onePagePdfBase64() } : null)],
];

const ROUTES = {
  'GET /api/portal/overview': () => overview(),
  'GET /api/portal/schedule': () => schedule(),
  'GET /api/portal/ticker': () => ticker(),
  'GET /api/portal-notes': () => notes(),
  'POST /api/portal-notes': () => ({ id: NOTE_ID_NEW }),
};
const STATUS = { 'POST /api/portal-notes': 201 };

// Returns { status, body } for a client-portal call, or null when no fixture exists.
function clientReply(method, url) {
  const [path, search = ''] = url.split('?');
  const key = `${method} ${path}`;
  if (key === 'GET /api/portal/jobs') {
    const params = new URLSearchParams(search);
    return { status: 200, body: jobList({ limit: Number(params.get('limit') || 20), offset: Number(params.get('offset') || 0) }) };
  }
  if (ROUTES[key]) return { status: STATUS[key] || 200, body: ROUTES[key]() };
  for (const [verb, pattern, build] of ID_ROUTES) {
    const match = verb === method && pattern.exec(path);
    const body = match ? build(Number(match[1])) : null;
    if (body) return { status: 200, body };
  }
  return null;
}

module.exports = { clientReply };
