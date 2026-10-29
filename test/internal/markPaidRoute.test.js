const { test } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const { start } = require('../helpers/server');
const { makeShopDb } = require('../helpers/shopSqliteDb');

const db = makeShopDb();
const dbPath = require.resolve('../../src/db/db.js');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: db };
const router = require('../../src/routes/invoices');

function reset() {
    db.sqlite.exec(`
        DELETE FROM stars; DELETE FROM job_part; DELETE FROM part; DELETE FROM job; DELETE FROM company;
        INSERT INTO company (id, name) VALUES (10, 'Acme');
        INSERT INTO job (id, company_id, invoice_number, invoice_status) VALUES (3, 10, 'INV-1', 'waiting');
        INSERT INTO job (id, company_id, invoice_number, invoice_status) VALUES (5, 10, NULL, 'waiting');
        INSERT INTO job (id, company_id, invoice_number, invoice_status) VALUES (6, 10, 'INV-6', 'paid');
        INSERT INTO part (id, number) VALUES (1, 'P-1');
        INSERT INTO job_part (id, job_id, part_id) VALUES (7, 3, 1), (8, 6, 1);
        INSERT INTO stars (job_part_id, status) VALUES (7, 'open'), (8, 'open');
    `);
}

async function withApp(fn) {
    reset();
    const app = express();
    app.use(express.json());
    app.use('/i', router);
    const server = await start(app);
    const post = async (path, body) => {
        const res = await fetch(`${server.baseUrl}/i${path}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        });
        return { status: res.status, body: await res.json() };
    };
    try { await fn(post); } finally { await server.close(); }
}
const starCount = () => db.sqlite.prepare('SELECT COUNT(*) n FROM stars').get().n;

test('markpaid answers 200 with message and unstarred, and removes the stars', () => withApp(async (post) => {
    assert.deepStrictEqual(await post('/markpaid', { jobId: 3 }),
        { status: 200, body: { message: 'Invoice marked as paid successfully', unstarred: 1 } });
    assert.strictEqual(starCount(), 1);
}));

test('markpaid keeps its error statuses and messages', () => withApp(async (post) => {
    assert.deepStrictEqual(await post('/markpaid', {}), { status: 400, body: { error: 'Job ID is required' } });
    assert.deepStrictEqual(await post('/markpaid', { jobId: 99 }), { status: 404, body: { error: 'Job not found' } });
    assert.deepStrictEqual(await post('/markpaid', { jobId: 5 }), { status: 400, body: { error: 'Job does not have an invoice number' } });
    assert.deepStrictEqual(await post('/markpaid', { jobId: 6 }), { status: 400, body: { error: 'Invoice is already marked as paid' } });
    assert.strictEqual(starCount(), 2);
}));

test('markpaid answers 500 on an unexpected failure', () => withApp(async (post) => {
    const orig = db.execute;
    db.execute = async () => { throw new Error('boom'); };
    const origErr = console.error; console.error = () => {};
    try {
        assert.deepStrictEqual(await post('/markpaid', { jobId: 3 }), { status: 500, body: { error: 'Failed to update invoice status' } });
    } finally { db.execute = orig; console.error = origErr; }
}));

test('markwaiting stars nothing and leaves stars alone', () => withApp(async (post) => {
    assert.deepStrictEqual(await post('/markwaiting', { jobId: 6 }),
        { status: 200, body: { message: 'Invoice marked as waiting successfully' } });
    assert.strictEqual(starCount(), 2);
}));
