const { test } = require('node:test');
const assert = require('node:assert');
const { makeFakeDb } = require('../helpers/fakeDb');
const { getQuarterSummary } = require('../../src/lib/financeSummary');

const NOW = new Date('2026-09-20T12:00:00Z');

function fakeDb({ period = [{ id: 7, year: 2026, quarter: 3 }], jobs = [], expenses = [] } = {}) {
    return makeFakeDb([
        { match: /FROM financial_period/, rows: period },
        { match: /FROM job_period/, rows: jobs },
        { match: /FROM expense/, rows: expenses },
    ]);
}

test('returns null for an unknown period', async () => {
    const db = fakeDb({ period: [] });
    assert.strictEqual(await getQuarterSummary(db, 99, NOW), null);
});

test('returns zeroed totals and three empty months with no rows', async () => {
    const out = await getQuarterSummary(fakeDb(), 7, NOW);
    assert.deepStrictEqual(out, {
        invoiced: { count: 0, total: 0 },
        paid: { count: 0, total: 0 },
        waiting: { count: 0, total: 0, over_30: 0 },
        expenses: { count: 0, total: 0 },
        profit: 0,
        months: [
            { month: '2026-07', invoiced: 0, expenses: 0 },
            { month: '2026-08', invoiced: 0, expenses: 0 },
            { month: '2026-09', invoiced: 0, expenses: 0 },
        ],
    });
});

test('summarises invoices, expenses, profit and months', async () => {
    const db = fakeDb({
        jobs: [
            { invoice_status: 'paid', total_cost: '100.10', invoice_date: '2026-07-05' },
            { invoice_status: 'paid', total_cost: '200.20', invoice_date: '2026-08-10' },
            { invoice_status: 'waiting', total_cost: '50.05', invoice_date: '2026-08-15' },
            { invoice_status: 'waiting', total_cost: '10', invoice_date: '2026-09-15' },
            { invoice_status: 'waiting', total_cost: null, invoice_date: null },
        ],
        expenses: [
            { amount: '40.01', expense_date: '2026-07-20' },
            { amount: '9.99', expense_date: new Date('2026-09-01T00:00:00Z') },
        ],
    });
    const out = await getQuarterSummary(db, 7, NOW);
    assert.deepStrictEqual(out.paid, { count: 2, total: 300.3 });
    assert.deepStrictEqual(out.waiting, { count: 3, total: 60.05, over_30: 1 });
    assert.deepStrictEqual(out.invoiced, { count: 5, total: 360.35 });
    assert.deepStrictEqual(out.expenses, { count: 2, total: 50 });
    assert.strictEqual(out.profit, 250.3);
    assert.deepStrictEqual(out.months, [
        { month: '2026-07', invoiced: 100.1, expenses: 40.01 },
        { month: '2026-08', invoiced: 250.25, expenses: 0 },
        { month: '2026-09', invoiced: 10, expenses: 9.99 },
    ]);
});

test('uses the period quarter to pick months', async () => {
    const db = fakeDb({ period: [{ id: 1, year: 2025, quarter: 1 }] });
    const out = await getQuarterSummary(db, 1, NOW);
    assert.deepStrictEqual(out.months.map((m) => m.month), ['2025-01', '2025-02', '2025-03']);
});

test('queries with the period id and dedupes expenses by id', async () => {
    const db = fakeDb();
    await getQuarterSummary(db, 7, NOW);
    assert.deepStrictEqual(db.calls[0].params, [7]);
    assert.ok(db.calls.slice(1).every((c) => c.params.includes(7)));
    assert.match(db.calls[2].sql, /UNION/);
});
