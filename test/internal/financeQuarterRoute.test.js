const { test } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const { start } = require('../helpers/server');
const { makeFakeDb } = require('../helpers/fakeDb');

const dbPath = require.resolve('../../src/db/db.js');
const stub = { execute: null };
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: stub };
const router = require('../../src/routes/finances');

async function get(execute, path) {
    stub.execute = execute;
    const app = express();
    app.use('/f', router);
    const server = await start(app);
    const origErr = console.error; console.error = () => {};
    try {
        const res = await fetch(`${server.baseUrl}/f${path}`);
        return { status: res.status, body: await res.json() };
    } finally { console.error = origErr; await server.close(); }
}

test('quarter answers 200 with the summary', async () => {
    const fake = makeFakeDb([
        { match: /FROM financial_period/, rows: [{ year: 2026, quarter: 3 }] },
        { match: /FROM job_period jp JOIN job/, rows: [{ invoice_status: 'paid', total_cost: '100.50', invoice_date: '2026-08-02' }] },
        { match: /FROM expense e/, rows: [{ id: 1, amount: '40', expense_date: '2026-08-10' }] },
    ]);
    const res = await get(fake.execute, '/periods/7/quarter');
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.body.paid, { count: 1, total: 100.5 });
    assert.deepStrictEqual(res.body.expenses, { count: 1, total: 40 });
    assert.strictEqual(res.body.profit, 60.5);
    assert.deepStrictEqual(res.body.months.map((m) => m.month), ['2026-07', '2026-08', '2026-09']);
    assert.strictEqual(fake.calls[0].params[0], '7');
});

test('quarter answers 404 for an unknown period', async () => {
    const res = await get(makeFakeDb().execute, '/periods/99/quarter');
    assert.deepStrictEqual(res, { status: 404, body: { error: 'Financial period not found' } });
});

test('quarter answers 500 when the db throws', async () => {
    const res = await get(async () => { throw new Error('boom'); }, '/periods/7/quarter');
    assert.deepStrictEqual(res, { status: 500, body: { error: 'Failed to fetch quarter summary' } });
});
