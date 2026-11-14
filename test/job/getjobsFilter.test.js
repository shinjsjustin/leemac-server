const { test } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const { DatabaseSync } = require('node:sqlite');
const { start } = require('../helpers/server');

const sqlite = new DatabaseSync(':memory:');
sqlite.exec(`
CREATE TABLE company (id INTEGER PRIMARY KEY, name TEXT);
CREATE TABLE job (id INTEGER PRIMARY KEY, job_number TEXT, company_id INTEGER, attention TEXT,
    created_at TEXT, po_number TEXT, po_date TEXT, invoice_number TEXT, invoice_date TEXT);
CREATE TABLE job_period (id INTEGER PRIMARY KEY, job_id INTEGER, financial_period_id INTEGER);
INSERT INTO company VALUES (1, 'Acme');
INSERT INTO job (id, job_number, company_id, attention, created_at, invoice_number, invoice_date) VALUES
 (1, 'J1', 1, 'Ann', '2026-01-01', 'I1', '2026-09-30'),
 (2, 'J2', 1, 'Bob', '2026-01-02', 'I2', '2026-10-01'),
 (3, 'J3', 1, 'Ann', '2026-01-03', 'I3', '2026-12-31'),
 (4, 'J4', 1, 'Cy',  '2026-01-04', 'I4', '2027-01-01'),
 (5, 'J5', 1, 'Dee', '2026-01-05', NULL, NULL);
INSERT INTO job_period (job_id, financial_period_id) VALUES (2, 7), (3, 7), (4, 8);
`);
const db = {
    async execute(sql, params = []) {
        const stmt = sqlite.prepare(sql);
        if (/^\s*SELECT/i.test(sql)) return [stmt.all(...params).map((r) => ({ ...r }))];
        stmt.run(...params);
        return [{}];
    },
};
const dbPath = require.resolve('../../src/db/db.js');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: db };
const crud = require('../../src/routes/job/crud');

const BASE = '/internal/job/getjobs?sortBy=created_at&order=desc&limit=35&offset=0&attention=';

async function get(query, attention = '') {
    const app = express();
    app.use('/internal/job', crud);
    const server = await start(app);
    const origErr = console.error; console.error = () => {};
    try {
        const res = await fetch(`${server.baseUrl}${BASE}${attention}${query}`);
        return { status: res.status, body: await res.json() };
    } finally { console.error = origErr; await server.close(); }
}
const ids = (r) => r.body.jobs.map((j) => j.id);

test('periodId returns only jobs linked in job_period, with a matching count', async () => {
    const r = await get('&periodId=7');
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(ids(r), [3, 2]);
    assert.strictEqual(r.body.pagination.total, 2);
});

test('from and to return jobs invoiced in the range, inclusive, with a matching count', async () => {
    const r = await get('&from=2026-10-01&to=2026-12-31');
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(ids(r), [3, 2]);
    assert.strictEqual(r.body.pagination.total, 2);
});

test('periodId combines with the attention filter', async () => {
    const r = await get('&periodId=7', 'Ann');
    assert.deepStrictEqual(ids(r), [3]);
    assert.strictEqual(r.body.pagination.total, 1);
});

test('without the new params every job is returned, newest first', async () => {
    const r = await get('');
    assert.deepStrictEqual(ids(r), [5, 4, 3, 2, 1]);
    assert.strictEqual(r.body.pagination.total, 5);
    assert.strictEqual(r.body.pagination.hasMore, false);
});

for (const [name, query] of [
    ['a non-integer periodId', '&periodId=abc'],
    ['a decimal periodId', '&periodId=7.5'],
    ['a bad from date', '&from=2026-13-01&to=2026-12-31'],
    ['a bad to date', '&from=2026-10-01&to=10/31/2026'],
    ['only from', '&from=2026-10-01'],
    ['only to', '&to=2026-12-31'],
]) {
    test(`answers 400 for ${name}`, async () => {
        assert.strictEqual((await get(query)).status, 400);
    });
}
