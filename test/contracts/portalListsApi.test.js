const { test, mock } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { start } = require('../helpers/server');
const { makeFakeTxDb } = require('../helpers/fakeTxDb');
const { SESSION_HANDLER, clientToken: signClientToken } = require('../helpers/session');

const sessionDb = { execute: async () => [SESSION_HANDLER.rows], query: async () => [SESSION_HANDLER.rows] };
const dbPath = require.resolve('../../src/db/db.js');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: sessionDb };

const contracts = require('../../src/client/src/api/contracts/portalListsApi.json');
const { createPortalListsRouter } = require('../../src/routes/portalLists');

const COMPANY = 5;
const token = signClientToken({ id: 1, username: 'u', name: 'Pat', company_id: COMPANY });

const LIST_ROW = { id: 3, name: 'L', created_by_name: 'Pat', updated_by_name: 'Pat' };
const REQUEST_ROW = { id: 9, company_id: COMPANY, client_id: '1', client_name: 'Pat', name: 'Spring order', status: 'sent' };
const PART = { part_id: 4, part_number: 'A-1', description: 'Bracket' };

// Stubs copied from test/portal/listsRouter.test.js, plus the ownership and lock reads the other routes make.
const HANDLERS = [
    { match: /COUNT\(\*\)/, rows: [{ n: 0 }] },
    { match: /INSERT INTO part_list /, rows: { insertId: 3 } },
    { match: /INSERT INTO quote_request /, rows: { insertId: 9 } },
    { match: /SELECT DISTINCT jp\.part_id/, rows: [{ part_id: 4 }] },
    { match: /SELECT part_id FROM part_list_item/, rows: [] },
    { match: /FROM part_list_item i\s+JOIN part p/, rows: [PART] },
    { match: /FROM part_list WHERE company_id/, rows: [LIST_ROW] },
    { match: /SELECT id, name FROM part_list/, rows: [{ id: 3, name: 'L' }] },
    { match: /FROM part_list WHERE id = \? AND company_id = \?/, rows: [LIST_ROW] },
    { match: /FROM quote_request WHERE id = \? AND company_id = \?/, rows: [REQUEST_ROW] },
    { match: /FROM quote_request_line/, rows: [{ id: 1, position: 0, part_number: 'A-1', quantity: 2 }] },
];

async function send({ method, path, body }) {
    const app = express();
    app.use(express.json());
    app.use('/portal-lists', createPortalListsRouter({
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
