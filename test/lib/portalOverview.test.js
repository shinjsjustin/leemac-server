const { test } = require('node:test');
const assert = require('node:assert');
const { makeFakeDb } = require('../helpers/fakeDb');
const { getOverview } = require('../../src/lib/portalOverview');

const USER = { id: 1, company_id: 5 };
const PART_ROWS = {
    match: /JOIN part p ON p\.id = jp\.part_id/,
    rows: [
        { part_id: 10, part_number: 'A-1', part_description: 'Bracket', job_id: 1, job_number: 'J1' },
        { part_id: 10, part_number: 'A-1', part_description: 'Bracket', job_id: 2, job_number: 'J2' },
        { part_id: 11, part_number: 'B-2', part_description: 'Plate', job_id: 2, job_number: 'J2' },
    ],
};
const FILE_ROWS = {
    match: /FROM uploaded_files/,
    rows: [
        { id: 10, part_id: 10, filename: 'new.step', mimetype: 'application/octet-stream' },
        { id: 9, part_id: 10, filename: 'new.png', mimetype: 'image/png' },
        { id: 8, part_id: 10, filename: 'old.pdf', mimetype: 'application/pdf' },
        { id: 7, part_id: 11, filename: 'x.step', mimetype: 'application/octet-stream' },
        { id: 6, part_id: 11, filename: 'Dwg.PDF', mimetype: 'application/octet-stream' },
    ],
};
const LIST_ROW = { match: /FROM part_list WHERE/, rows: [{ id: 3, name: 'L' }] };
const REQUEST_ROW = { match: /FROM quote_request WHERE/, rows: [{ id: 4, status: 'sent' }] };
const JOB_COUNT = { match: /COUNT\(\*\) AS total/, rows: [{ total: 1 }] };
const JOB_ROW = { match: /FROM job j\s+WHERE j\.company_id/, rows: [{ id: 1, job_number: 'J1' }] };

const NOW = new Date(2026, 5, 15);
const row = (job_id, job_number, due_date, ship_date, job_part_id, part_id, star_status) => ({
    job_id, job_number, due_date, ship_date, invoice_date: null,
    job_part_id, part_id, part_number: `P${part_id}`, rev: 'A', star_status,
});
const HEADLINE_ROWS = {
    match: /LEFT JOIN stars/,
    rows: [
        row(1, 'J1', '2026-06-10', null, 101, 10, 'running_machine_a'), // overdue
        row(1, 'J1', '2026-06-10', null, 102, 11, 'qa'),
        row(2, 'J2', '2026-06-20', null, 103, 10, 'done'), // all done: no flag
        row(3, 'J3', '2026-06-18', null, 104, 11, 'setup'), // due soon
        row(4, 'J4', '2026-07-30', null, null, null, null), // active, no stars
        row(5, 'J5', '2026-05-01', '2026-05-01', 105, 11, 'delivered'), // on time
        row(6, 'J6', '2026-05-01', '2026-05-03', 106, 11, 'delivered'), // late
        row(7, 'J7', '2026-05-01', '2026-01-01', 107, 11, 'invoiced'), // too old
    ],
};

const handlers = [JOB_COUNT, JOB_ROW, PART_ROWS, FILE_ROWS, LIST_ROW, REQUEST_ROW, HEADLINE_ROWS];

test('returns headline, jobs, pagination, parts, lists, requests and wall', async () => {
    const result = await getOverview(makeFakeDb(handlers), USER, { limit: '5', offset: '0' }, NOW);

    assert.deepStrictEqual(Object.keys(result).sort(), ['headline', 'jobs', 'lists', 'pagination', 'parts', 'requests', 'wall']);
    assert.strictEqual(result.jobs[0].job_number, 'J1');
    assert.deepStrictEqual(result.pagination, { total: 1, limit: 5, offset: 0, hasMore: false });
    assert.strictEqual(result.lists[0].id, 3);
    assert.strictEqual(result.requests[0].id, 4);
});

test('groups parts with their jobs and keeps only PDF drawings, newest first', async () => {
    const { parts } = await getOverview(makeFakeDb(handlers), USER, {});

    assert.deepStrictEqual(parts, [
        {
            part_id: 10, part_number: 'A-1', part_description: 'Bracket',
            jobs: [{ id: 1, job_number: 'J1' }, { id: 2, job_number: 'J2' }],
            drawings: [
                { id: 8, filename: 'old.pdf', mimetype: 'application/pdf', kind: 'pdf', url: '/api/portal/files/8' },
            ],
        },
        {
            part_id: 11, part_number: 'B-2', part_description: 'Plate',
            jobs: [{ id: 2, job_number: 'J2' }],
            drawings: [{ id: 6, filename: 'Dwg.PDF', mimetype: 'application/octet-stream', kind: 'other', url: '/api/portal/files/6' }],
        },
    ]);
});

test('part with no drawings gets an empty drawings array', async () => {
    const db = makeFakeDb([JOB_COUNT, JOB_ROW, PART_ROWS]);
    const { parts } = await getOverview(db, USER, {});
    assert.deepStrictEqual(parts.map((p) => p.drawings), [[], []]);
});

test('every query binds the token company and file content is never selected', async () => {
    const db = makeFakeDb(handlers);
    await getOverview(db, { ...USER, company_id: 5, id: 99 }, {});

    // listJobs' part query is keyed by job ids it just read for this company.
    const scoped = db.calls.filter((c) => !/WHERE jp\.job_id IN/.test(c.sql));
    assert.strictEqual(scoped.length, db.calls.length - 1);
    for (const call of scoped) assert.ok(call.params.includes(5), call.sql);
    const fileCall = db.calls.find((c) => /FROM uploaded_files/.test(c.sql));
    assert.doesNotMatch(fileCall.sql, /content/);
    assert.match(fileCall.sql, /job_id IS NULL AND f\.note_id IS NULL/);
    assert.match(fileCall.sql, /LOWER\(f\.filename\) LIKE '%\.pdf'/);
});

test('makes at most 10 db calls however many parts exist', async () => {
    const many = Array.from({ length: 200 }, (_, i) => ({
        part_id: i + 1, part_number: `P${i}`, part_description: 'd', job_id: i + 1, job_number: `J${i}`,
    }));
    const files = many.map((p) => ({ id: p.part_id, part_id: p.part_id, filename: 'f.pdf', mimetype: 'application/pdf' }));
    const db = makeFakeDb([JOB_COUNT, JOB_ROW, { ...PART_ROWS, rows: many }, { ...FILE_ROWS, rows: files }]);

    const { parts } = await getOverview(db, USER, {});

    assert.strictEqual(parts.length, 200);
    assert.ok(db.calls.length <= 10, `made ${db.calls.length} calls`);
});

test('headline counts own jobs from one query over dates and star statuses', async () => {
    const { headline } = await getOverview(makeFakeDb(handlers), USER, {}, NOW);

    assert.deepStrictEqual(headline, {
        active_jobs: 4, due_soon: 1, overdue: 1, on_time_rate: 50, parts_in_shop: 3,
        next_due: '2026-06-18', shipped_on_time: 1, shipped_total: 2,
    });
});

test('on_time_rate is null when nothing shipped in the last 90 days', async () => {
    const rows = [row(1, 'J1', '2026-06-10', null, 101, 10, 'setup'), row(7, 'J7', '2026-05-01', '2026-01-01', 107, 11, 'delivered')];
    const { headline } = await getOverview(makeFakeDb([JOB_COUNT, JOB_ROW, { ...HEADLINE_ROWS, rows }]), USER, {}, NOW);

    assert.strictEqual(headline.on_time_rate, null);
});

test('headline of a company with no jobs is zeros and empty wall', async () => {
    const result = await getOverview(makeFakeDb([JOB_COUNT]), USER, {}, NOW);

    assert.deepStrictEqual(result.headline, {
        active_jobs: 0, due_soon: 0, overdue: 0, on_time_rate: null, parts_in_shop: 0,
        next_due: null, shipped_on_time: 0, shipped_total: 0,
    });
    assert.deepStrictEqual(result.wall, []);
});

test('wall lists starred parts least advanced first with newest drawing or null', async () => {
    const { wall } = await getOverview(makeFakeDb(handlers), USER, {}, NOW);

    assert.deepStrictEqual(wall.map((w) => w.job_part_id), [104, 101, 102, 103, 105, 106, 107]);
    assert.deepStrictEqual(wall[0], {
        job_part_id: 104, part_id: 11, part_number: 'P11', rev: 'A', job_id: 3, job_number: 'J3',
        stage: { key: 'preparing', label: 'Preparing' },
        drawing: { id: 6, filename: 'Dwg.PDF', mimetype: 'application/octet-stream', kind: 'other', url: '/api/portal/files/6' },
    });
    assert.strictEqual(wall[1].drawing.id, 8);
    assert.strictEqual(wall[1].stage.key, 'machining');
    const noDrawing = await getOverview(makeFakeDb([JOB_COUNT, JOB_ROW, PART_ROWS, HEADLINE_ROWS]), USER, {}, NOW);
    assert.strictEqual(noDrawing.wall[0].drawing, null);
});

test('wall holds at most 12 parts', async () => {
    const rows = Array.from({ length: 15 }, (_, i) => row(1, 'J1', null, null, 200 + i, 10, 'setup'));
    const { wall } = await getOverview(makeFakeDb([JOB_COUNT, JOB_ROW, { ...HEADLINE_ROWS, rows }]), USER, {}, NOW);

    assert.strictEqual(wall.length, 12);
});

test('next_due is today when a job is due today and null when every unshipped due date has passed', async () => {
    const today = [row(1, 'J1', '2026-06-15', null, 101, 10, 'setup'), row(2, 'J2', '2026-06-01', null, 102, 10, 'setup')];
    const past = [row(2, 'J2', '2026-06-01', null, 102, 10, 'setup'), row(3, 'J3', '2026-06-20', '2026-06-10', 103, 10, 'delivered')];
    const a = await getOverview(makeFakeDb([JOB_COUNT, JOB_ROW, { ...HEADLINE_ROWS, rows: today }]), USER, {}, NOW);
    const b = await getOverview(makeFakeDb([JOB_COUNT, JOB_ROW, { ...HEADLINE_ROWS, rows: past }]), USER, {}, NOW);

    assert.strictEqual(a.headline.next_due, '2026-06-15');
    assert.strictEqual(b.headline.next_due, null);
});

test('each request keeps the line_count listRequests selected, 0 when missing, from one company-scoped query', async () => {
    const requests = { ...REQUEST_ROW, rows: [{ id: 4, status: 'sent', line_count: 3 }, { id: 6, status: 'draft' }] };
    const db = makeFakeDb([JOB_COUNT, JOB_ROW, requests]);

    const result = await getOverview(db, USER, {}, NOW);

    assert.deepStrictEqual(result.requests.map((r) => r.line_count), [3, 0]);
    const lineCalls = db.calls.filter((c) => /quote_request_line/.test(c.sql));
    assert.strictEqual(lineCalls.length, 1);
    assert.match(lineCalls[0].sql, /company_id = \?/);
    assert.deepStrictEqual(lineCalls[0].params, [5]);
});

test('a q in the query never filters the overview jobs with LIKE', async () => {
    const db = makeFakeDb(handlers);
    await getOverview(db, USER, { limit: '5', offset: '0', q: 'A-1' }, NOW);

    const jobCalls = db.calls.filter((c) => /FROM job j\s/.test(c.sql) && /LIMIT/.test(c.sql));
    assert.ok(jobCalls.length > 0);
    for (const call of jobCalls) {
        assert.doesNotMatch(call.sql, /LIKE/);
        assert.ok(!call.params.includes('%A-1%'));
    }
});
