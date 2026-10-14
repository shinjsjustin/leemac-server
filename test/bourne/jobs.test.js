const { test } = require('node:test');
const assert = require('node:assert');
const { start } = require('../helpers/server');
const { makeFakeDb } = require('../helpers/fakeDb');
const express = require('express');

const KEY = process.env.BOURNE_READ_KEY;

const JOB_ROW = { id: 2, job_number: '102', client: 'Acme', attention: 'Bob', po_number: 'PO1', po_date: '2026-01-01', due_date: '2026-02-01', created_at: '2026-01-01T00:00:00Z', invoice_number: 'INV1', invoice_status: 'waiting' };

function makeDb(total = 120) {
    return makeFakeDb([
        { match: /COUNT\(\*\)/, rows: [{ total }] },
        { match: /FROM job/, rows: [JOB_ROW] },
    ]);
}

async function get(db, query = '') {
    const { createBourneRouter } = require('../../src/routes/bourne');
    const app = express();
    app.use('/api/bourne', createBourneRouter({ db }));
    const server = await start(app);
    try {
        const res = await fetch(`${server.baseUrl}/api/bourne/jobs${query}`, { headers: { 'X-Bourne-Key': KEY } });
        return { status: res.status, body: await res.json() };
    } finally { await server.close(); }
}

const rowsCall = (db) => db.calls.find((c) => !/COUNT\(\*\)/.test(c.sql));
const countCall = (db) => db.calls.find((c) => /COUNT\(\*\)/.test(c.sql));

test('returns jobs with explicit fields and default paging', async () => {
    const db = makeDb(120);
    const { status, body } = await get(db);
    assert.strictEqual(status, 200);
    assert.deepStrictEqual(body, {
        jobs: [JOB_ROW],
        pagination: { total: 120, limit: 50, offset: 0, hasMore: true },
    });
    assert.match(rowsCall(db).sql, /ORDER BY j\.created_at DESC, j\.id DESC/);
    assert.match(rowsCall(db).sql, /LIMIT 50 OFFSET 0/);
    assert.doesNotMatch(rowsCall(db).sql, /\*/);
});

test('hasMore is false on the last page', async () => {
    const { body } = await get(makeDb(60), '?limit=10&offset=50');
    assert.deepStrictEqual(body.pagination, { total: 60, limit: 10, offset: 50, hasMore: false });
});

test('clamps limit into 1..200', async () => {
    const high = await get(makeDb(), '?limit=999');
    assert.strictEqual(high.body.pagination.limit, 200);
    const low = await get(makeDb(), '?limit=0');
    assert.strictEqual(low.body.pagination.limit, 1);
});

test('filters are bound params, never interpolated, and shared by the count', async () => {
    const db = makeDb();
    const evil = "x' OR 1=1 --";
    const { status } = await get(db, `?since=2026-01-01&client=${encodeURIComponent(evil)}&from=5&to=9`);
    assert.strictEqual(status, 200);
    const expected = ['2026-01-01', `%${evil}%`, `%${evil}%`, 5, 9];
    for (const call of [rowsCall(db), countCall(db)]) {
        assert.deepStrictEqual(call.params, expected);
        assert.doesNotMatch(call.sql, /OR 1=1|2026-01-01/);
        assert.match(call.sql, /j\.created_at >= \?/);
        assert.match(call.sql, /c\.name LIKE \? OR j\.attention LIKE \?/);
        assert.match(call.sql, /CAST\(j\.job_number AS UNSIGNED\) >= \?/);
        assert.match(call.sql, /CAST\(j\.job_number AS UNSIGNED\) <= \?/);
    }
});

test('no filters means no WHERE and no params', async () => {
    const db = makeDb();
    await get(db);
    assert.doesNotMatch(rowsCall(db).sql, /WHERE/);
    assert.deepStrictEqual(rowsCall(db).params, []);
});

for (const query of ['since=yesterday', 'since=2026-13-45', 'from=abc', 'from=1.5', 'to=', 'limit=abc', 'limit=1.5', 'offset=-1', 'offset=x']) {
    test(`rejects ${query} with 400 and runs no query`, async () => {
        const db = makeDb();
        const { status, body } = await get(db, `?${query}`);
        assert.strictEqual(status, 400);
        assert.strictEqual(typeof body.error, 'string');
        assert.strictEqual(db.calls.length, 0);
    });
}
