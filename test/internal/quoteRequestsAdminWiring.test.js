const { test } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const { start } = require('../helpers/server');
const { makeFakeTxDb } = require('../helpers/fakeTxDb');
const { assertMysqlQuotesClosed } = require('../helpers/mysqlSql');

// The router module builds a default router on the real pool at require time; keep that off MySQL.
const dbPath = require.resolve('../../src/db/db.js');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { execute: async () => [[]], query: async () => [[]] } };
const { createQuoteRequestsAdminRouter } = require('../../src/routes/quoteRequestsAdmin');

const REQUEST = { id: 5, company_id: 2, client_id: '9', client_name: 'Bob', name: 'Brackets', need_by: null, note: null, status: 'sent', job_id: null };
const LINE = { id: 10, request_id: 5, position: 0, part_number: 'P-1', description: 'Bracket', rev: 'A', material: 'Al', finish: null, quantity: 3, price: '12.50', part_id: null, bourne_suggestion: '{"rev":"B"}' };
const FILE = { id: 20, line_id: 10, filename: 'a.pdf', mimetype: 'application/pdf', size: 4 };

function makeDb(request = REQUEST) {
    return makeFakeTxDb([
        { match: /FROM quote_request WHERE id/, rows: [request] },
        { match: /FROM quote_request_line WHERE request_id = \? ORDER BY position, id/, rows: [LINE] },
        { match: /FROM quote_request_file WHERE request_id/, rows: [FILE] },
        { match: /SELECT id FROM quote_request_line WHERE request_id/, rows: [{ id: 10 }] },
        { match: /SELECT id, part_number, description, rev, material, finish, quantity, price/, rows: [LINE] },
        { match: /FROM metadata/, rows: [{ metavalue: '"100"' }] },
        { match: /INSERT INTO job \(/, rows: { insertId: 77 } },
        { match: /INSERT IGNORE INTO part/, rows: { insertId: 31, affectedRows: 1 } },
        { match: /INSERT INTO job_part/, rows: { insertId: 41 } },
        { match: /FROM part p/, rows: [{ part_id: 31, number: 'P-1', description: 'Bracket', job_id: 3, job_number: '90' }] },
    ]);
}

async function call(db, method, path, body) {
    const app = express();
    app.use(express.json());
    app.use('/q', createQuoteRequestsAdminRouter({ db }));
    const server = await start(app);
    try {
        const res = await fetch(`${server.baseUrl}/q${path}`, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: body ? JSON.stringify(body) : undefined,
        });
        const result = { status: res.status, body: await res.json() };
        db.calls.filter((c) => c.sql).forEach((c) => assertMysqlQuotesClosed(c.sql));
        return result;
    } finally { await server.close(); }
}

test('GET /:id returns the review with priced lines, parsed suggestion and files', async () => {
    const res = await call(makeDb(), 'GET', '/5');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.id, 5);
    assert.strictEqual(res.body.lines[0].price, '12.50');
    assert.deepStrictEqual(res.body.lines[0].bourne_suggestion, { rev: 'B' });
    assert.deepStrictEqual(res.body.lines[0].files, [FILE]);
    assert.deepStrictEqual(res.body.files, []);
});

test('GET /:id is 404 for a draft request', async () => {
    assert.strictEqual((await call(makeDb({ ...REQUEST, status: 'draft' }), 'GET', '/5')).status, 404);
});

test('PUT /:id saves the lines in a transaction and returns the review', async () => {
    const db = makeDb();
    const res = await call(db, 'PUT', '/5', { lines: [{ id: 10, part_number: ' P-1 ', quantity: 4, price: '15' }] });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.id, 5);
    assert.ok(Array.isArray(res.body.lines));
    const update = db.calls.find((c) => /UPDATE quote_request_line SET part_number/.test(c.sql));
    assert.strictEqual(update.params[0], 'P-1');
    assert.strictEqual(update.params[5], 4);
    assert.ok(db.calls.some((c) => c.tx === 'commit'));
});

test('PUT /:id answers 400 when lines is not an array', async () => {
    const res = await call(makeDb(), 'PUT', '/5', {});
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.error, 'lines must be an array.');
});

test('GET /:id/check lists the matching parts per line', async () => {
    const res = await call(makeDb(), 'GET', '/5/check');
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.body, [{
        line_id: 10,
        part_number: 'P-1',
        matches: [{ part_id: 31, number: 'P-1', description: 'Bracket', jobs: [{ id: 3, job_number: '90' }] }],
    }]);
});

test('POST /:id/job answers 201 with the new job id and number', async () => {
    const db = makeDb();
    const res = await call(db, 'POST', '/5/job');
    assert.strictEqual(res.status, 201);
    assert.deepStrictEqual(res.body, { id: 77, job_number: '101' });
    assert.ok(db.calls.some((c) => /UPDATE quote_request SET status = 'job_created'/.test(c.sql)));
    assert.ok(db.calls.some((c) => c.tx === 'commit'));
});

test('POST /:id/job answers 409 when the request already has a job', async () => {
    const res = await call(makeDb({ ...REQUEST, status: 'job_created' }), 'POST', '/5/job');
    assert.strictEqual(res.status, 409);
});
