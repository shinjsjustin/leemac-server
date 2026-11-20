const { test } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const { start } = require('../helpers/server');

const dbPath = require.resolve('../../src/db/db.js');
const stub = { execute: null };
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: stub };
const expenseRouter = require('../../src/routes/expense');
const financesRouter = require('../../src/routes/finances');

// Behaves like MySQL after migration 029: expense_job has no notes column.
async function execute(sql) {
    if (/\bej\.notes\b/.test(sql)) {
        const err = new Error("Unknown column 'ej.notes' in 'field list'");
        err.code = 'ER_BAD_FIELD_ERROR';
        throw err;
    }
    if (/COUNT\(\*\)/.test(sql)) return [[{ total: 1 }]];
    if (/FROM financial_period WHERE/.test(sql)) return [[{ id: 7 }]];
    if (/FROM expense_job ej/.test(sql)) {
        return [[{ expense_id: 1, job_id: 3, job_number: 'J1', company_name: 'Acme' }]];
    }
    if (/FROM expense_financial_period efp\s+JOIN financial_period/.test(sql)) return [[]];
    if (/FROM expense/.test(sql)) return [[{ id: 1, amount: '40', notes: 'keep me' }]];
    return [[]];
}

const cases = [
    ['/e/all', expenseRouter],
    ['/e/byjob/3', expenseRouter],
    ['/e/byperiod/7', expenseRouter],
    ['/e/1', expenseRouter],
    ['/f/periods/7/expenses', financesRouter],
    ['/f/unassigned/expenses', financesRouter],
];

for (const [path, router] of cases) {
    test(`GET ${path} answers 200 without link_notes when expense_job.notes is gone`, async () => {
        stub.execute = execute;
        const app = express();
        app.use('/e', expenseRouter);
        app.use('/f', financesRouter);
        const server = await start(app);
        try {
            const res = await fetch(`${server.baseUrl}${path}`);
            const text = await res.text();
            assert.strictEqual(res.status, 200);
            assert.ok(!text.includes('link_notes'));
            assert.ok(text.includes('keep me'));
        } finally { await server.close(); }
    });
}
