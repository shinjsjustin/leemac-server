const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { start } = require('../helpers/server');
const { makeFakeTxDb } = require('../helpers/fakeTxDb');

// The router module builds a default router on the real pool at require time; keep that off MySQL.
const dbPath = require.resolve('../../src/db/db.js');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { execute: async () => [[]], query: async () => [[]] } };

const contracts = require('../../src/client/src/api/contracts/quoteRequestsAdminApi.json');
const { createQuoteRequestsAdminRouter } = require('../../src/routes/quoteRequestsAdmin');

const REQUEST = { id: 5, company_id: 2, client_id: '9', client_name: 'Bob', name: 'Brackets', need_by: null, note: null, status: 'sent', job_id: null };
const LINE = { id: 10, request_id: 5, position: 0, part_number: 'P-1', description: 'Bracket', rev: 'A', material: 'Al', finish: null, quantity: 3, price: '12.50', part_id: null, bourne_suggestion: '{"rev":"B"}' };
const FILE = { id: 20, line_id: 10, filename: 'a.pdf', mimetype: 'application/pdf', size: 4 };

function makeDb() {
    return makeFakeTxDb([
        { match: /FROM quote_request WHERE id/, rows: [REQUEST] },
        { match: /SELECT id, status FROM quote_request WHERE id/, rows: [REQUEST] },
        { match: /SELECT id FROM quote_request_line WHERE id = \? AND request_id/, rows: [{ id: 10 }] },
        { match: /FROM quote_request_line WHERE request_id = \? ORDER BY position, id/, rows: [LINE] },
        { match: /FROM quote_request_file WHERE request_id/, rows: [FILE] },
        { match: /FROM quote_request_file f\s+JOIN quote_request r/, rows: [{ filename: 'a.pdf', mimetype: 'application/pdf', content: Buffer.from('%PDF') }] },
        { match: /SELECT id FROM quote_request_line WHERE request_id/, rows: [{ id: 10 }] },
        { match: /SELECT id, part_number, description, rev, material, finish, quantity, price/, rows: [LINE] },
        { match: /FROM metadata/, rows: [{ metavalue: '"100"' }] },
        { match: /INSERT INTO job \(/, rows: { insertId: 77 } },
        { match: /INSERT IGNORE INTO part/, rows: { insertId: 31, affectedRows: 1 } },
        { match: /INSERT INTO job_part/, rows: { insertId: 41 } },
        { match: /FROM part p/, rows: [{ id: 31, number: 'P-1', description: 'Bracket', job_number: '90' }] },
    ]);
}

const PREFIX = '/internal/quote-requests';

async function send({ method, path, body }) {
    const app = express();
    app.use(express.json());
    app.use(PREFIX, createQuoteRequestsAdminRouter({ db: makeDb() }));
    const server = await start(app);
    try {
        const res = await fetch(`${server.baseUrl}${path}`, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: body ? JSON.stringify(body) : undefined,
        });
        await res.arrayBuffer();
        return res.status;
    } finally { await server.close(); }
}

for (const [name, entry] of Object.entries(contracts)) {
    [].concat(entry).forEach((one, i) => {
        test(`${name} #${i + 1} request gets 2xx from the real router`, async () => {
            const status = await send(one);
            assert.ok(status >= 200 && status < 300, `${one.method} ${one.path} answered ${status}`);
        });
    });
}
