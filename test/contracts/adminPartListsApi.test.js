const { test, mock } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { start } = require('../helpers/server');
const { makeFakeTxDb } = require('../helpers/fakeTxDb');
const { SESSION_HANDLER, adminToken } = require('../helpers/session');

const sessionDb = { execute: async () => [SESSION_HANDLER.rows], query: async () => [SESSION_HANDLER.rows] };
const dbPath = require.resolve('../../src/db/db.js');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: sessionDb };

const contracts = require('../../src/client/src/api/contracts/adminPartListsApi.json');
const isAuth = require('../../src/middleware/isAuth');
const { requireAdmin } = require('../../src/middleware/requireRole');
const { createAdminPartListsRouter } = require('../../src/routes/adminPartLists');

const ADMIN_LEVEL = 2;
const token = adminToken({ id: 1, email: 'ad@min.com', access_level: ADMIN_LEVEL });

const LIST_ROW = { id: 3, name: 'L', created_by_name: 'ad@min.com', updated_by_name: 'ad@min.com' };

const HANDLERS = [
    { match: /COUNT\(\*\)/, rows: [{ n: 0 }] },
    { match: /INSERT INTO admin_part_list /, rows: { insertId: 3 } },
    { match: /SELECT id FROM part WHERE/, rows: [{ id: 4 }] },
    { match: /SELECT part_id FROM admin_part_list_item/, rows: [] },
    { match: /FROM admin_part_list_item i/, rows: [] },
    { match: /FROM admin_part_list WHERE id = \? FOR UPDATE/, rows: [{ id: 3 }] },
    { match: /FROM admin_part_list /, rows: [LIST_ROW] },
];

async function send({ method, path, body }) {
    const app = express();
    app.use(express.json());
    app.use('/internal/part-lists', isAuth, requireAdmin(ADMIN_LEVEL), createAdminPartListsRouter({ db: makeFakeTxDb(HANDLERS) }));
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
