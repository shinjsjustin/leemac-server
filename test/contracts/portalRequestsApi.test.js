const { test, mock } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { start } = require('../helpers/server');
const { makeFakeTxDb } = require('../helpers/fakeTxDb');
const { SESSION_HANDLER, clientToken: signClientToken } = require('../helpers/session');

const sessionDb = { execute: async () => [SESSION_HANDLER.rows], query: async () => [SESSION_HANDLER.rows] };
const dbPath = require.resolve('../../src/db/db.js');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: sessionDb };

const contracts = require('../../src/client/src/api/contracts/portalRequestsApi.json');
const { createPortalRequestsRouter } = require('../../src/routes/portalRequests');

const COMPANY = 5;
const token = signClientToken({ id: 1, username: 'u', name: 'Pat', company_id: COMPANY });

const REQUEST_ROW = { id: 3, company_id: COMPANY, client_id: '1', client_name: 'Pat', name: 'N', status: 'draft' };
const FILE = { filename: 'a.pdf', mimetype: 'application/pdf', content: Buffer.from('%PDF-bytes') };

// Stubs copied from test/portal/requestsRouter.test.js, plus the draft lock, line and file reads.
const HANDLERS = [
    { match: /INSERT INTO quote_request /, rows: { insertId: 3 } },
    { match: /FOR UPDATE/, rows: [{ id: 3, status: 'draft' }] },
    { match: /DELETE FROM quote_request_file/, rows: { affectedRows: 1 } },
    { match: /SELECT id FROM quote_request_line/, rows: [{ id: 11 }] },
    { match: /FROM quote_request_file f/, rows: [FILE] },
    { match: /FROM quote_request WHERE id = \? AND company_id = \?/, rows: [REQUEST_ROW] },
    { match: /FROM quote_request WHERE company_id/, rows: [REQUEST_ROW] },
    { match: /FROM quote_request_line/, rows: [{ id: 11, position: 0, part_number: 'A1', quantity: 7 }] },
    { match: /UPDATE quote_request SET status/, rows: { affectedRows: 1 } },
];

async function send({ method, path, body }) {
    const app = express();
    app.use(express.json());
    app.use('/portal-requests', createPortalRequestsRouter({
        db: makeFakeTxDb(HANDLERS), writeLimiter: (req, res, next) => next(), send: async () => {},
    }));
    const info = mock.method(console, 'info', () => {});
    const { baseUrl, close } = await start(app);
    try {
        const res = await fetch(`${baseUrl}${path}`, {
            method,
            headers: {
                Authorization: `Bearer ${token}`,
                ...(body ? { 'Content-Type': 'application/json' } : {}),
            },
            body: body ? JSON.stringify(body) : undefined,
        });
        return res.status;
    } finally {
        await close();
        info.mock.restore();
    }
}

for (const [name, value] of Object.entries(contracts)) {
    for (const entry of [].concat(value)) {
        test(`${name} ${entry.method} ${entry.path} ${JSON.stringify(entry.body)} answers 2xx`, async () => {
            const status = await send(entry);
            assert.ok(status >= 200 && status < 300, `got ${status}`);
        });
    }
}
