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
        { id: 9, part_id: 10, filename: 'new.png', mimetype: 'image/png' },
        { id: 8, part_id: 10, filename: 'old.pdf', mimetype: 'application/pdf' },
        { id: 7, part_id: 11, filename: 'x.step', mimetype: 'application/octet-stream' },
    ],
};
const LIST_ROW = { match: /FROM part_list WHERE/, rows: [{ id: 3, name: 'L' }] };
const REQUEST_ROW = { match: /FROM quote_request WHERE/, rows: [{ id: 4, status: 'sent' }] };
const JOB_COUNT = { match: /COUNT\(\*\)/, rows: [{ total: 1 }] };
const JOB_ROW = { match: /FROM job j\s+WHERE j\.company_id/, rows: [{ id: 1, job_number: 'J1' }] };

const handlers = [JOB_COUNT, JOB_ROW, PART_ROWS, FILE_ROWS, LIST_ROW, REQUEST_ROW];

test('returns jobs, pagination, parts, lists and requests', async () => {
    const result = await getOverview(makeFakeDb(handlers), USER, { limit: '5', offset: '0' });

    assert.deepStrictEqual(Object.keys(result).sort(), ['jobs', 'lists', 'pagination', 'parts', 'requests']);
    assert.strictEqual(result.jobs[0].job_number, 'J1');
    assert.deepStrictEqual(result.pagination, { total: 1, limit: 5, offset: 0, hasMore: false });
    assert.strictEqual(result.lists[0].id, 3);
    assert.strictEqual(result.requests[0].id, 4);
});

test('groups parts with their jobs and shapes drawings newest first', async () => {
    const { parts } = await getOverview(makeFakeDb(handlers), USER, {});

    assert.deepStrictEqual(parts, [
        {
            part_id: 10, part_number: 'A-1', part_description: 'Bracket',
            jobs: [{ id: 1, job_number: 'J1' }, { id: 2, job_number: 'J2' }],
            drawings: [
                { id: 9, filename: 'new.png', mimetype: 'image/png', kind: 'image', url: '/api/portal/files/9' },
                { id: 8, filename: 'old.pdf', mimetype: 'application/pdf', kind: 'pdf', url: '/api/portal/files/8' },
            ],
        },
        {
            part_id: 11, part_number: 'B-2', part_description: 'Plate',
            jobs: [{ id: 2, job_number: 'J2' }],
            drawings: [{ id: 7, filename: 'x.step', mimetype: 'application/octet-stream', kind: 'other', url: '/api/portal/files/7' }],
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
});

test('makes at most 8 db calls however many parts exist', async () => {
    const many = Array.from({ length: 200 }, (_, i) => ({
        part_id: i + 1, part_number: `P${i}`, part_description: 'd', job_id: i + 1, job_number: `J${i}`,
    }));
    const files = many.map((p) => ({ id: p.part_id, part_id: p.part_id, filename: 'f.pdf', mimetype: 'application/pdf' }));
    const db = makeFakeDb([JOB_COUNT, JOB_ROW, { ...PART_ROWS, rows: many }, { ...FILE_ROWS, rows: files }]);

    const { parts } = await getOverview(db, USER, {});

    assert.strictEqual(parts.length, 200);
    assert.ok(db.calls.length <= 8, `made ${db.calls.length} calls`);
});
