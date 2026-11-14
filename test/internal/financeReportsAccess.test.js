const { test } = require('node:test');
const assert = require('node:assert');
const { start } = require('../helpers/server');
const { SESSION_HANDLER, adminToken: signAdmin } = require('../helpers/session');

const fakeDb = {
    execute: async (sql) => [/FROM auth_session/.test(sql) ? SESSION_HANDLER.rows : []],
    query: async (sql) => [/FROM auth_session/.test(sql) ? SESSION_HANDLER.rows : []],
};
const dbPath = require.resolve('../../src/db/db.js');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: fakeDb };

const adminToken = (level) => signAdmin({ id: 7, email: 'a@x.com', name: 'A', access_level: level });

async function get(server, path, token) {
    const res = await fetch(`${server.baseUrl}/api/internal/finances/reports/${path}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    return res.status;
}

test('level 2 admin is refused the report downloads and level 3 is not', async () => {
    const server = await start(require('../../src/app'));
    const origErr = console.error; console.error = () => {};
    try {
        for (const path of ['ledger.xlsx?periodId=7', 'receivables.pdf?periodId=7']) {
            assert.strictEqual(await get(server, path, adminToken(2)), 403, `level 2 ${path}`);
            const status = await get(server, path, adminToken(3));
            assert.ok(status !== 401 && status !== 403, `level 3 ${path} got ${status}`);
        }
    } finally { console.error = origErr; await server.close(); }
});
