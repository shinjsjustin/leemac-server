const { test } = require('node:test');
const assert = require('node:assert');
const jwt = require('jsonwebtoken');
const { start } = require('../helpers/server');
const { SESSION_HANDLER, adminToken: signAdmin, clientToken: signClient } = require('../helpers/session');

const fakeDb = {
    execute: async (sql) => [/FROM auth_session/.test(sql) ? SESSION_HANDLER.rows : []],
    query: async (sql) => [/FROM auth_session/.test(sql) ? SESSION_HANDLER.rows : []],
};
const dbPath = require.resolve('../../src/db/db.js');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: fakeDb };

const adminRow = { id: 7, email: 'a@x.com', name: 'A' };
const adminToken = (level) => signAdmin({ ...adminRow, access_level: level });
const clientToken = signClient({ id: 1, username: 'u', name: 'n', company_id: 2 });
const roleLessToken = jwt.sign({ id: 1, access: 3 }, process.env.JWT_SECRET);

async function status(server, method, path, token) {
    const res = await fetch(`${server.baseUrl}/api/internal${path}`, {
        method,
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: method === 'GET' ? undefined : JSON.stringify({}),
    });
    return res.status;
}

const isRefused = (s) => s === 401 || s === 403;

test('client and role-less tokens get 403 on level-1 internal routes', async () => {
    const server = await start(require('../../src/app'));
    try {
        for (const path of ['/job/getjobs', '/company/getcompanies']) {
            assert.strictEqual(await status(server, 'GET', path, clientToken), 403, `client ${path}`);
            assert.strictEqual(await status(server, 'GET', path, roleLessToken), 403, `role-less ${path}`);
        }
    } finally {
        await server.close();
    }
});

test('level-1 admin is allowed and level-0 admin is refused on getjobs', async () => {
    const server = await start(require('../../src/app'));
    try {
        assert.strictEqual(await status(server, 'GET', '/job/getjobs', adminToken(0)), 403);
        assert.ok(!isRefused(await status(server, 'GET', '/job/getjobs', adminToken(1))));
    } finally {
        await server.close();
    }
});

const levelThreeRoutes = [
    ['GET', '/admins/x'],
    ['GET', '/invoices/x'],
    ['GET', '/expenses/x'],
    ['GET', '/finances/x'],
    ['GET', '/sheet/x'],
    ['DELETE', '/part/deleteblob'],
    ['DELETE', '/part/deletepart'],
    ['POST', '/job/updateinvoiceandincrement'],
    ['POST', '/job/export'],
    ['POST', '/sheet/populate'],
];

for (const [method, path] of levelThreeRoutes) {
    test(`${method} ${path} refuses level 2 and admits level 3`, async () => {
        const server = await start(require('../../src/app'));
        try {
            assert.strictEqual(await status(server, method, path, adminToken(2)), 403);
            assert.ok(!isRefused(await status(server, method, path, adminToken(3))));
        } finally {
            await server.close();
        }
    });
}

test('level-1 routes stay open to level 1 where not level 3 only', async () => {
    const server = await start(require('../../src/app'));
    try {
        for (const [method, path] of [['POST', '/job/calculatecost'], ['POST', '/part/newpart']]) {
            assert.ok(!isRefused(await status(server, method, path, adminToken(1))), path);
        }
    } finally {
        await server.close();
    }
});
