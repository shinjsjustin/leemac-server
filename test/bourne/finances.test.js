const { test } = require('node:test');
const assert = require('node:assert');
const { start } = require('../helpers/server');
const { makeFakeDb } = require('../helpers/fakeDb');
const express = require('express');

const KEY = process.env.BOURNE_READ_KEY;

const PERIODS = [
    { id: 2, label: 'Q2 2026', quarter: 2, year: 2026, start_date: '2026-04-01', end_date: '2026-06-30' },
    { id: 1, label: 'Q1 2026', quarter: 1, year: 2026, start_date: '2026-01-01', end_date: '2026-03-31' },
];
const INVOICE_TOTALS = [
    { invoice_status: 'waiting', count: 3, total_amount: '300.50' },
    { invoice_status: 'paid', count: 5, total_amount: '900' },
];
const PERIOD_INVOICES = [
    { period_id: 1, invoice_status: 'waiting', count: 2, total_amount: '100.25' },
    { period_id: 1, invoice_status: 'paid', count: 1, total_amount: '50' },
];
const PERIOD_EXPENSES = [{ period_id: 1, count: 4, total_expenses: '75.5' }];

const PERIOD_JOBS = [
    { id: 9, job_number: '109', client: 'Acme', po_number: 'PO1', invoice_number: 'INV1', invoice_date: '2026-02-01', invoice_status: 'waiting', total_cost: '100.50' },
    { id: 10, job_number: '110', client: 'Zed', po_number: null, invoice_number: 'INV2', invoice_date: '2026-02-02', invoice_status: 'paid', total_cost: '200' },
];
const PERIOD_EXPENSE_LIST = [
    { id: 3, description: 'Tooling', vendor: 'Acme Tools', amount: '10.25', expense_date: '2026-02-03', category: 'tools' },
    { id: 4, description: 'Stock', vendor: null, amount: '20', expense_date: '2026-02-04', category: null },
];

function overviewDb(metadata = [{ metavalue: '"2"' }]) {
    return makeFakeDb([
        { match: /FROM metadata/, rows: metadata },
        { match: /FROM job\s+WHERE invoice_number IS NOT NULL/, rows: INVOICE_TOTALS },
        { match: /FROM job_period jp[\s\S]*GROUP BY/, rows: PERIOD_INVOICES },
        { match: /UNION/, rows: PERIOD_EXPENSES },
        { match: /FROM financial_period/, rows: PERIODS },
    ]);
}

function detailDb({ period = [PERIODS[1]] } = {}) {
    return makeFakeDb([
        { match: /FROM financial_period/, rows: period },
        { match: /FROM job_period/, rows: PERIOD_JOBS },
        { match: /FROM expense e/, rows: PERIOD_EXPENSE_LIST },
    ]);
}

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

test('GET /finances returns current period, invoice totals and per-period summaries newest first', async () => {
    const { status, body } = await get(overviewDb(), '/finances');
    assert.strictEqual(status, 200);
    assert.deepStrictEqual(Object.keys(body), ['current_period_id', 'invoices', 'periods']);
    assert.strictEqual(body.current_period_id, '2');
    assert.deepStrictEqual(body.invoices, {
        waiting: { count: 3, total_amount: 300.5 },
        paid: { count: 5, total_amount: 900 },
    });
    assert.deepStrictEqual(body.periods, [
        { ...PERIODS[0], summary: {
            waiting: { count: 0, total_amount: 0 },
            paid: { count: 0, total_amount: 0 },
            combined: { count: 0, total_amount: 0 },
            expenses: { count: 0, total_amount: 0 },
        } },
        { ...PERIODS[1], summary: {
            waiting: { count: 2, total_amount: 100.25 },
            paid: { count: 1, total_amount: 50 },
            combined: { count: 3, total_amount: 150.25 },
            expenses: { count: 4, total_amount: 75.5 },
        } },
    ]);
});

test('GET /finances gives null current_period_id and zero invoices when nothing is stored', async () => {
    const db = makeFakeDb();
    const { status, body } = await get(db, '/finances');
    assert.strictEqual(status, 200);
    assert.deepStrictEqual(body, {
        current_period_id: null,
        invoices: { waiting: { count: 0, total_amount: 0 }, paid: { count: 0, total_amount: 0 } },
        periods: [],
    });
});

test('GET /finances orders periods by year then quarter descending and renames lable', async () => {
    const db = overviewDb();
    await get(db, '/finances');
    const sql = db.calls.find((c) => /FROM financial_period/.test(c.sql)).sql;
    assert.match(sql, /lable AS label/);
    assert.match(sql, /ORDER BY year DESC, quarter DESC/);
});

test('GET /finances/periods/:id returns period, summary, jobs and expenses', async () => {
    const { status, body } = await get(detailDb(), '/finances/periods/1');
    assert.strictEqual(status, 200);
    assert.deepStrictEqual(Object.keys(body), ['period', 'summary', 'jobs', 'expenses']);
    assert.deepStrictEqual(body.period, PERIODS[1]);
    assert.deepStrictEqual(body.summary, {
        waiting: { count: 1, total_amount: 100.5 },
        paid: { count: 1, total_amount: 200 },
        combined: { count: 2, total_amount: 300.5 },
        expenses: { count: 2, total_amount: 30.25 },
    });
    assert.deepStrictEqual(body.jobs, PERIOD_JOBS);
    assert.deepStrictEqual(body.expenses, PERIOD_EXPENSE_LIST);
});

test('GET /finances/periods/:id queries by the period id', async () => {
    const db = detailDb();
    await get(db, '/finances/periods/1');
    for (const c of db.calls.filter((c) => !/FROM expense e/.test(c.sql))) {
        assert.deepStrictEqual(c.params, [1]);
    }
    assert.deepStrictEqual(db.calls.find((c) => /FROM expense e/.test(c.sql)).params, [1, 1]);
});

test('GET /finances/periods/:id returns 400 for a bad id and 404 for an unknown one', async () => {
    const bad = await get(detailDb(), '/finances/periods/abc');
    assert.strictEqual(bad.status, 400);
    assert.ok(bad.body.error);
    const missing = await get(detailDb({ period: [] }), '/finances/periods/99');
    assert.strictEqual(missing.status, 404);
    assert.ok(missing.body.error);
});

test('finances queries are SELECTs with explicit columns', async () => {
    const overview = overviewDb();
    await get(overview, '/finances');
    const detail = detailDb();
    await get(detail, '/finances/periods/1');
    const calls = [...overview.calls, ...detail.calls];
    assert.ok(calls.length === 8);
    for (const { sql } of calls) {
        assert.match(sql.trim(), /^SELECT/);
        assert.doesNotMatch(sql.replace(/COUNT\(\*\)/g, ''), /\*|password|token|google_/i);
    }
});

test('returns 500 JSON when the db fails', async () => {
    const db = { execute: async () => { throw new Error('boom'); }, query: async () => { throw new Error('boom'); } };
    for (const path of ['/finances', '/finances/periods/1']) {
        const { status, body } = await get(db, path);
        assert.strictEqual(status, 500);
        assert.ok(body.error);
    }
});
