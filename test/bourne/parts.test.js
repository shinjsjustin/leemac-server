const { test } = require('node:test');
const assert = require('node:assert');
const { start } = require('../helpers/server');
const { makeFakeDb } = require('../helpers/fakeDb');
const express = require('express');

const KEY = process.env.BOURNE_READ_KEY;

const PART_ROW = { id: 3, number: 'P-100', description: 'Bracket' };
const JOB_ROW = { job_id: 9, job_number: '109', client: 'Acme', po_number: 'PO1', po_date: '2026-01-01', due_date: '2026-02-01', created_at: '2026-01-01T00:00:00Z', invoice_status: 'waiting', job_part_id: 40, quantity: 5, price: 20, rev: 'A', details: 'anodize', star_status: 'open' };
const FILE_ROW = { id: 50, filename: 'a.pdf', mimetype: 'application/pdf', size: 123, uploaded_at: '2026-01-03T00:00:00Z' };

async function get(db, path) {
    const { createBourneRouter } = require('../../src/routes/bourne');
    const app = express();
    app.use('/api/bourne', createBourneRouter({ db }));
    const server = await start(app);
    try {
        const res = await fetch(`${server.baseUrl}/api/bourne${path}`, { headers: { 'X-Bourne-Key': KEY } });
        return { status: res.status, body: await res.json() };
    } finally { await server.close(); }
}

const listDb = (total = 120) => makeFakeDb([
    { match: /COUNT\(\*\)/, rows: [{ total }] },
    { match: /FROM part/, rows: [PART_ROW] },
]);
const rowsCall = (db) => db.calls.find((c) => !/COUNT\(\*\)/.test(c.sql));
const countCall = (db) => db.calls.find((c) => /COUNT\(\*\)/.test(c.sql));

test('search returns parts with paging, ordered by number then id', async () => {
    const db = listDb();
    const { status, body } = await get(db, '/parts');
    assert.strictEqual(status, 200);
    assert.deepStrictEqual(body, {
        parts: [PART_ROW],
        pagination: { total: 120, limit: 50, offset: 0, hasMore: true },
    });
    assert.match(rowsCall(db).sql, /ORDER BY p\.number, p\.id/);
    assert.match(rowsCall(db).sql, /LIMIT 50 OFFSET 0/);
    assert.doesNotMatch(rowsCall(db).sql, /WHERE/);
    assert.deepStrictEqual(rowsCall(db).params, []);
});

test('q, number and description are bound LIKE params shared with the count', async () => {
    const db = listDb();
    const evil = "x' OR 1=1 --";
    const { status } = await get(db, `/parts?q=${encodeURIComponent(evil)}&number=P&description=brack`);
    assert.strictEqual(status, 200);
    const expected = [`%${evil}%`, `%${evil}%`, '%P%', '%brack%'];
    for (const call of [rowsCall(db), countCall(db)]) {
        assert.deepStrictEqual(call.params, expected);
        assert.doesNotMatch(call.sql, /OR 1=1/);
        assert.match(call.sql, /\(p\.number LIKE \? OR p\.description LIKE \?\)/);
        assert.match(call.sql, /p\.number LIKE \?/);
        assert.match(call.sql, /p\.description LIKE \?/);
    }
});

for (const query of ['limit=abc', 'limit=1.5', 'offset=-1', 'offset=x']) {
    test(`search rejects ${query} with 400`, async () => {
        const db = listDb();
        const { status, body } = await get(db, `/parts?${query}`);
        assert.strictEqual(status, 400);
        assert.ok(body.error);
        assert.strictEqual(db.calls.length, 0);
    });
}

const detailDb = (part = [PART_ROW]) => makeFakeDb([
    { match: /FROM part p/, rows: part },
    { match: /FROM job_part/, rows: [JOB_ROW] },
    { match: /FROM uploaded_files/, rows: [{ ...FILE_ROW, content: 'x' }] },
]);

test('detail returns part with jobs and file metadata', async () => {
    const db = detailDb();
    const { status, body } = await get(db, '/parts/3');
    assert.strictEqual(status, 200);
    assert.deepStrictEqual(body, { part: { ...PART_ROW, jobs: [JOB_ROW], files: [FILE_ROW] } });
    const jobsCall = db.calls.find((c) => /FROM job_part/.test(c.sql));
    assert.match(jobsCall.sql, /LEFT JOIN stars/);
    assert.match(jobsCall.sql, /ORDER BY j\.created_at DESC, j\.id DESC/);
    assert.deepStrictEqual(jobsCall.params, [3]);
    for (const c of db.calls) assert.doesNotMatch(c.sql, /content/);
});

test('detail rejects a non-integer id with 400', async () => {
    const db = detailDb();
    const { status } = await get(db, '/parts/abc');
    assert.strictEqual(status, 400);
    assert.strictEqual(db.calls.length, 0);
});

test('detail returns 404 JSON for an unknown id', async () => {
    const { status, body } = await get(detailDb([]), '/parts/999');
    assert.strictEqual(status, 404);
    assert.ok(body.error);
});
