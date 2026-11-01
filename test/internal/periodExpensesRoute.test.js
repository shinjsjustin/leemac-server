const { test } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const { start } = require('../helpers/server');

const dbPath = require.resolve('../../src/db/db.js');
const stub = { execute: null };
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: stub };
const router = require('../../src/routes/finances');

// Returns file_id only when the expense SELECT asks for the column, like MySQL would.
async function execute(sql) {
    if (/FROM financial_period/.test(sql)) return [[{ id: 7 }]];
    if (/COUNT\(\*\)/.test(sql)) return [[{ total: 2 }]];
    if (/FROM expense_financial_period efp/.test(sql)) {
        const withFile = /\be\.file_id\b/.test(sql);
        return [[
            { id: 1, amount: '40', ...(withFile && { file_id: 55 }) },
            { id: 2, amount: '10', ...(withFile && { file_id: null }) },
        ]];
    }
    return [[]];
}

test('period expenses carry file_id on each expense', async () => {
    stub.execute = execute;
    const app = express();
    app.use('/f', router);
    const server = await start(app);
    try {
        const res = await fetch(`${server.baseUrl}/f/periods/7/expenses`);
        const body = await res.json();
        assert.strictEqual(res.status, 200);
        assert.deepStrictEqual(body.expenses.map((e) => e.file_id), [55, null]);
    } finally { await server.close(); }
});
