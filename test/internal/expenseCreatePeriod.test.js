const { test } = require('node:test');
const assert = require('node:assert');
const { DatabaseSync } = require('node:sqlite');
const express = require('express');
const { start } = require('../helpers/server');

const sqlite = new DatabaseSync(':memory:');
sqlite.exec(`
    CREATE TABLE financial_period (id INTEGER PRIMARY KEY, start_date TEXT, end_date TEXT);
    CREATE TABLE expense (id INTEGER PRIMARY KEY, description TEXT, vendor TEXT, amount REAL, expense_date TEXT, category TEXT, notes TEXT);
    CREATE TABLE expense_job (id INTEGER PRIMARY KEY, expense_id INTEGER, job_id INTEGER);
    CREATE TABLE expense_financial_period (id INTEGER PRIMARY KEY, expense_id INTEGER, financial_period_id INTEGER);
    INSERT INTO financial_period (id, start_date, end_date) VALUES
        (7, '2026-07-01', '2026-09-30'), (8, '2026-10-01', '2026-12-31');
`);

const execute = async (sql, params = []) => {
    if (/^\s*select/i.test(sql)) return [sqlite.prepare(sql).all(...params).map((r) => ({ ...r }))];
    const r = sqlite.prepare(sql).run(...params);
    return [{ insertId: Number(r.lastInsertRowid), affectedRows: r.changes }];
};
// mysql2's bulk "VALUES ?" form, expanded for sqlite
const query = async (sql, [rows]) => {
    for (const row of rows) await execute(sql.replace('VALUES ?', `VALUES (${row.map(() => '?').join(', ')})`), row);
};
const conn = {
    execute, query, release: () => {},
    beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {},
};
const db = { execute, query, getConnection: async () => conn };
const dbPath = require.resolve('../../src/db/db.js');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: db };
const router = require('../../src/routes/expense');

async function create(body) {
    sqlite.exec('DELETE FROM expense; DELETE FROM expense_financial_period');
    const app = express();
    app.use(express.json());
    app.use('/e', router);
    const server = await start(app);
    try {
        const res = await fetch(`${server.baseUrl}/e/create`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        });
        return { status: res.status, body: await res.json() };
    } finally { await server.close(); }
}
const links = () => sqlite.prepare('SELECT expense_id e, financial_period_id p FROM expense_financial_period').all().map((r) => ({ ...r }));
const base = { description: 'Bolts', vendor: 'Acme', amount: 12.5, expense_date: '2026-11-14' };

test('create without periodIds links the expense to the period of its expense_date', async () => {
    const res = await create(base);
    assert.strictEqual(res.status, 201);
    assert.deepStrictEqual(links(), [{ e: res.body.id, p: 8 }]);
});

test('create with an empty periodIds list links by date too', async () => {
    const res = await create({ ...base, periodIds: [] });
    assert.deepStrictEqual(links(), [{ e: res.body.id, p: 8 }]);
});

test('create links by the date part of an ISO timestamp', async () => {
    const res = await create({ ...base, expense_date: '2026-08-02T10:00:00.000Z' });
    assert.deepStrictEqual(links(), [{ e: res.body.id, p: 7 }]);
});

test('create with periodIds links only those periods', async () => {
    const res = await create({ ...base, periodIds: [7] });
    assert.deepStrictEqual(links(), [{ e: res.body.id, p: 7 }]);
});

test('create with a date in no period links nothing and answers 201', async () => {
    const res = await create({ ...base, expense_date: '2025-01-01' });
    assert.strictEqual(res.status, 201);
    assert.deepStrictEqual(links(), []);
});
