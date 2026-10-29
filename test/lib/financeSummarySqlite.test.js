const { test } = require('node:test');
const assert = require('node:assert');
const { DatabaseSync } = require('node:sqlite');
const { getQuarterSummary } = require('../../src/lib/financeSummary');

const SCHEMA = `
CREATE TABLE financial_period (id INTEGER PRIMARY KEY, year INTEGER, quarter INTEGER);
CREATE TABLE job (id INTEGER PRIMARY KEY, invoice_status TEXT, total_cost REAL, invoice_date TEXT);
CREATE TABLE job_period (id INTEGER PRIMARY KEY, job_id INTEGER, financial_period_id INTEGER);
CREATE TABLE expense (id INTEGER PRIMARY KEY, amount REAL, expense_date TEXT);
CREATE TABLE expense_job (id INTEGER PRIMARY KEY, expense_id INTEGER, job_id INTEGER);
CREATE TABLE expense_financial_period (id INTEGER PRIMARY KEY, expense_id INTEGER, financial_period_id INTEGER);
INSERT INTO financial_period (id, year, quarter) VALUES (7, 2026, 3), (8, 2026, 4);
INSERT INTO job (id, invoice_status, total_cost, invoice_date) VALUES (1, 'paid', 500, '2026-08-01');
INSERT INTO job_period (job_id, financial_period_id) VALUES (1, 7);
INSERT INTO expense (id, amount, expense_date) VALUES
    (1, 100, '2026-07-05'), (2, 20, '2026-08-05'), (3, 900, '2026-11-05');
INSERT INTO expense_job (expense_id, job_id) VALUES (1, 1);
INSERT INTO expense_financial_period (expense_id, financial_period_id) VALUES (1, 7), (2, 7), (3, 8);
`;

function makeDb() {
    const sqlite = new DatabaseSync(':memory:');
    sqlite.exec(SCHEMA);
    return {
        async execute(sql, params = []) {
            return [sqlite.prepare(sql).all(...params).map((r) => ({ ...r }))];
        },
    };
}

test('quarter summary counts an expense linked by job and by period once', async () => {
    const summary = await getQuarterSummary(makeDb(), 7);
    assert.deepStrictEqual(summary.expenses, { count: 2, total: 120 });
    assert.strictEqual(summary.profit, 380);
    assert.deepStrictEqual(summary.months.map((m) => m.expenses), [100, 20, 0]);
});

test('quarter summary excludes an expense linked only to another period', async () => {
    const summary = await getQuarterSummary(makeDb(), 8);
    assert.deepStrictEqual(summary.expenses, { count: 1, total: 900 });
});
