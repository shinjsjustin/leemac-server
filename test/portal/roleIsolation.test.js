const { test } = require('node:test');
const assert = require('node:assert');
const { start } = require('../helpers/server');
const { SESSION_HANDLER, adminToken: signAdmin, clientToken: signClient } = require('../helpers/session');

const dataCalls = [];
const fakeDb = {
    execute: async (sql, params) => {
        if (SESSION_HANDLER.match.test(sql)) return [SESSION_HANDLER.rows];
        dataCalls.push({ sql, params });
        return [[]];
    },
};
fakeDb.query = fakeDb.execute;
const dbPath = require.resolve('../../src/db/db.js');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: fakeDb };

const clientToken = signClient({ id: 1, username: 'u', name: 'n', company_id: 2 });
const adminToken = (level) => signAdmin({ id: 7, email: 'a@x.com', name: 'A', access_level: level });

async function status(server, method, path, token) {
    const res = await fetch(`${server.baseUrl}${path}`, {
        method,
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: method === 'GET' ? undefined : JSON.stringify({}),
    });
    return res.status;
}

const STAFF_ROUTES = [
    ['GET', '/api/internal/job/getjobs'],
    ['GET', '/api/internal/company/getcompanies'],
    ['GET', '/api/internal/finances/x'],
    ['GET', '/api/internal/admins/x'],
    ['GET', '/api/jarvis/todos'],
    ['POST', '/api/admin/register'],
    ['POST', '/api/client/invite'],
    ['GET', '/api/client/'],
];

const PORTAL_ROUTES = ['/jobs', '/jobs/1', '/parts/1/files', '/files/1'];

test('client token gets 403 on staff routes and no data query runs', async () => {
    const server = await start(require('../../src/app'));
    try {
        dataCalls.length = 0;
        for (const [method, path] of STAFF_ROUTES) {
            assert.strictEqual(await status(server, method, path, clientToken), 403, `${method} ${path}`);
        }
        assert.deepStrictEqual(dataCalls, []);
    } finally {
        await server.close();
    }
});

for (const level of [0, 1, 2, 3]) {
    test(`admin level ${level} gets 403 on every portal route`, async () => {
        const server = await start(require('../../src/app'));
        try {
            dataCalls.length = 0;
            for (const path of PORTAL_ROUTES) {
                assert.strictEqual(await status(server, 'GET', `/api/portal${path}`, adminToken(level)), 403, path);
            }
            assert.deepStrictEqual(dataCalls, []);
        } finally {
            await server.close();
        }
    });
}
