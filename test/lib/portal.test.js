const { test } = require('node:test');
const assert = require('node:assert/strict');
const { makeFakeDb } = require('../helpers/fakeDb');
const portal = require('../../src/lib/portal');

const JOB_KEYS = ['due_date', 'id', 'job_number', 'parts', 'po_date', 'po_number', 'ship_date', 'status'];
const PART_KEYS = ['job_part_id', 'part_id', 'part_number', 'quantity', 'rev', 'status', 'unit_price'];
const FORBIDDEN = /select \*|total_cost|subtotal|\btax|invoice|\bnotes?\b|expense|attention|details/i;

const LEAK = { total_cost: '9', subtotal: '8', tax: '1', invoice_number: 'I', note: 'n', attention: 'a', details: 'd' };

const jobRow = (over = {}) => ({
    id: 1, job_number: 'J1', po_number: 'PO', po_date: '2026-01-01', due_date: '2026-02-01',
    ship_date: null, ...LEAK, ...over,
});
const partRow = (over = {}) => ({
    job_id: 1, job_part_id: 10, part_id: 100, part_number: 'P-1', rev: 'A', quantity: 3,
    price: '12.50', star_status: null, ...LEAK, ...over,
});

// Order matters: first match wins. Ownership queries select only an id column.
function jobsDb({ total = 1, jobs = [jobRow()], parts = [partRow()] } = {}) {
    return makeFakeDb([
        { match: /COUNT\(\*\)/, rows: [{ total }] },
        { match: /FROM job_part jp\s+JOIN part p/, rows: parts },
        { match: /ORDER BY j\.created_at DESC, j\.id DESC/, rows: jobs },
    ]);
}

test('listJobs returns only whitelisted job and part fields', async () => {
    const { jobs, pagination } = await portal.listJobs(jobsDb(), 7, {});
    assert.deepEqual(Object.keys(jobs[0]).sort(), JOB_KEYS);
    assert.deepEqual(Object.keys(jobs[0].parts[0]).sort(), PART_KEYS);
    assert.deepEqual(jobs[0].parts[0], {
        job_part_id: 10, part_id: 100, part_number: 'P-1', rev: 'A', quantity: 3, status: 'open', unit_price: 12.5,
    });
    assert.deepEqual(pagination, { total: 1, limit: 20, offset: 0, hasMore: false });
});

test('listJobs status is shipped only when ship_date is set', async () => {
    const db = jobsDb({
        total: 2,
        jobs: [jobRow({ id: 1, ship_date: '2026-03-01' }), jobRow({ id: 2 })],
        parts: [],
    });
    const { jobs } = await portal.listJobs(db, 7, {});
    assert.deepEqual(jobs.map((j) => j.status), ['shipped', 'open']);
});

test('part status uses star status when starred, else the job status', async () => {
    const db = jobsDb({
        jobs: [jobRow({ ship_date: '2026-03-01' })],
        parts: [partRow({ job_part_id: 10, star_status: 'in progress' }), partRow({ job_part_id: 11 })],
    });
    const { jobs } = await portal.listJobs(db, 7, {});
    assert.deepEqual(jobs[0].parts.map((p) => p.status), ['in progress', 'shipped']);
});

test('unit_price is null when price is null and a number otherwise', async () => {
    const db = jobsDb({ parts: [partRow({ price: null }), partRow({ job_part_id: 11, price: '0.00' })] });
    const { jobs } = await portal.listJobs(db, 7, {});
    assert.deepEqual(jobs[0].parts.map((p) => p.unit_price), [null, 0]);
});

test('parts are grouped under their own job', async () => {
    const db = jobsDb({
        total: 2,
        jobs: [jobRow({ id: 1 }), jobRow({ id: 2 })],
        parts: [partRow({ job_id: 2, job_part_id: 20 }), partRow({ job_id: 1, job_part_id: 10 })],
    });
    const { jobs } = await portal.listJobs(db, 7, {});
    assert.deepEqual(jobs.map((j) => j.parts.map((p) => p.job_part_id)), [[10], [20]]);
});

test('listJobs binds companyId and returns no parts query for an empty page', async () => {
    const db = jobsDb({ total: 0, jobs: [], parts: [] });
    const { jobs, pagination } = await portal.listJobs(db, 7, {});
    assert.deepEqual(jobs, []);
    assert.equal(pagination.hasMore, false);
    assert.equal(db.calls.length, 2);
    for (const c of db.calls) assert.deepEqual(c.params, [7]);
});

const pagingCases = [
    [{}, 20, 0],
    [{ limit: '5', offset: '10' }, 5, 10],
    [{ limit: 0 }, 1, 0],
    [{ limit: -5 }, 1, 0],
    [{ limit: 500 }, 100, 0],
    [{ limit: 'abc', offset: 'xyz' }, 20, 0],
    [{ offset: -3 }, 20, 0],
];
for (const [input, limit, offset] of pagingCases) {
    test(`listJobs paging ${JSON.stringify(input)} gives limit ${limit} offset ${offset}`, async () => {
        const db = jobsDb({ total: 1000, jobs: [], parts: [] });
        const { pagination } = await portal.listJobs(db, 7, input);
        assert.deepEqual(pagination, { total: 1000, limit, offset, hasMore: offset + limit < 1000 });
        assert.match(db.calls[1].sql, new RegExp(`LIMIT ${limit} OFFSET ${offset}`));
    });
}

test('getJob returns null without querying job data when company does not own the job', async () => {
    const db = makeFakeDb([]);
    assert.equal(await portal.getJob(db, 7, 1), null);
    assert.equal(db.calls.length, 1);
    assert.deepEqual(db.calls[0].params, [1, 7]);
});

test('getJob returns the whitelisted job with parts when owned', async () => {
    const db = makeFakeDb([
        { match: /SELECT job\.id FROM job WHERE/, rows: [{ id: 1 }] },
        { match: /FROM job_part jp\s+JOIN part p/, rows: [partRow()] },
        { match: /FROM job j/, rows: [jobRow()] },
    ]);
    const job = await portal.getJob(db, 7, 1);
    assert.deepEqual(Object.keys(job).sort(), JOB_KEYS);
    assert.equal(job.parts.length, 1);
    assert.deepEqual(Object.keys(job.parts[0]).sort(), PART_KEYS);
    const jobQuery = db.calls.find((c) => /FROM job j/.test(c.sql));
    assert.ok(jobQuery.params.includes(7));
});

test('listPartFiles returns null when company does not own the part', async () => {
    const db = makeFakeDb([]);
    assert.equal(await portal.listPartFiles(db, 7, 100), null);
    assert.equal(db.calls.length, 1);
    assert.deepEqual(db.calls[0].params, [100, 7]);
});

test('listPartFiles returns metadata only, from part-only file rows', async () => {
    const db = makeFakeDb([
        { match: /SELECT jp\.part_id/, rows: [{ part_id: 100 }] },
        {
            match: /FROM uploaded_files/,
            rows: [{ id: 5, filename: 'a.pdf', mimetype: 'application/pdf', size: 9, uploaded_at: 'T', content: Buffer.from('x'), job_id: null }],
        },
    ]);
    const files = await portal.listPartFiles(db, 7, 100);
    assert.deepEqual(files, [{ id: 5, filename: 'a.pdf', mimetype: 'application/pdf', size: 9, uploaded_at: 'T' }]);
    const q = db.calls[1];
    assert.match(q.sql, /part_id = \?/);
    assert.match(q.sql, /job_id IS NULL/);
    assert.match(q.sql, /note_id IS NULL/);
    assert.doesNotMatch(q.sql, /content/);
    assert.deepEqual(q.params, [100]);
});

test('getPartFile returns filename, mimetype, size and content for an owned part file', async () => {
    const content = Buffer.from('abc');
    const db = makeFakeDb([
        { match: /FROM uploaded_files/, rows: [{ filename: 'a.pdf', mimetype: 'application/pdf', size: 3, content, id: 5, job_id: null }] },
    ]);
    const file = await portal.getPartFile(db, 7, 5);
    assert.deepEqual(file, { filename: 'a.pdf', mimetype: 'application/pdf', size: 3, content });
    const { sql, params } = db.calls[0];
    assert.match(sql, /f\.part_id IS NOT NULL/);
    assert.match(sql, /f\.job_id IS NULL/);
    assert.match(sql, /f\.note_id IS NULL/);
    assert.match(sql, /company_id = \?/);
    assert.deepEqual(params, [5, 7]);
});

test('getPartFile returns null when no row matches', async () => {
    assert.equal(await portal.getPartFile(makeFakeDb([]), 7, 5), null);
});

test('no portal SQL selects everything or names an internal field', async () => {
    const db = makeFakeDb([
        { match: /COUNT\(\*\)/, rows: [{ total: 1 }] },
        { match: /SELECT job\.id FROM job/, rows: [{ id: 1 }] },
        { match: /SELECT jp\.part_id/, rows: [{ part_id: 100 }] },
        { match: /FROM job_part jp\s+JOIN part p/, rows: [partRow()] },
        { match: /ORDER BY j\.created_at/, rows: [jobRow()] },
        { match: /FROM job j/, rows: [jobRow()] },
        { match: /FROM uploaded_files/, rows: [{ id: 5, filename: 'a', mimetype: 'm', size: 1, content: Buffer.from('x') }] },
    ]);
    await portal.listJobs(db, 7, {});
    await portal.getJob(db, 7, 1);
    await portal.listPartFiles(db, 7, 100);
    await portal.getPartFile(db, 7, 5);
    assert.ok(db.calls.length >= 8);
    for (const { sql } of db.calls) assert.doesNotMatch(sql, FORBIDDEN);
});
