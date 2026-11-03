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

const levelOneRoutes = [
    ['GET', '/job/getjobs'],
    ['PUT', '/job/pairnfctag'],
    ['PUT', '/job/unpairnfctag'],
    ['PUT', '/job/updatestarstatusbynfctag'],
    ['PUT', '/job/setstarstage'],
    ['POST', '/job/finishpart'],
    ['PUT', '/job/setstarflag'],
    ['DELETE', '/job/unstarjob'],
    ['POST', '/notes/newnote'],
    ['PUT', '/notes/share'],
    ['POST', '/job/matchjobbyparts'],
    ['POST', '/job/getjobsbypartids'],
    ['POST', '/quote-requests/1/check'],
    ['POST', '/print'],
    ['POST', '/print/job/drawings'],
    ['POST', '/printers/1/test'],
];

for (const [method, path] of levelOneRoutes) {
    test(`${method} ${path} is not refused for level 1 and 2`, async () => {
        const server = await start(require('../../src/app'));
        try {
            const expected = path.startsWith('/quote-requests') ? [2] : [1, 2];
            for (const level of expected) {
                assert.ok(!isRefused(await status(server, method, path, adminToken(level))), `level ${level}`);
            }
        } finally {
            await server.close();
        }
    });
}

const writeRoutes = [
    ['POST', '/job/updatepo'],
    ['POST', '/job/updatedetails'],
    ['POST', '/job/updatejobpartjoin'],
    ['POST', '/part/newpart'],
    ['POST', '/part-lists'],
    ['PUT', '/quote-requests/1'],
];

for (const [method, path] of writeRoutes) {
    test(`${method} ${path} refuses level 1 and 2 and admits level 3`, async () => {
        const server = await start(require('../../src/app'));
        try {
            assert.strictEqual(await status(server, method, path, adminToken(1)), 403);
            assert.strictEqual(await status(server, method, path, adminToken(2)), 403);
            assert.ok(!isRefused(await status(server, method, path, adminToken(3))));
        } finally {
            await server.close();
        }
    });
}

for (const path of ['/simple/overview', '/simple/quoted']) {
    test(`GET ${path} refuses level 1 and admits level 2`, async () => {
        const server = await start(require('../../src/app'));
        try {
            assert.strictEqual(await status(server, 'GET', path, adminToken(1)), 403);
            assert.ok(!isRefused(await status(server, 'GET', path, adminToken(2))));
        } finally {
            await server.close();
        }
    });
}

for (const method of ['PUT', 'DELETE']) {
    test(`${method} /simple/jobs/1/no-bid refuses level 2 and admits level 3`, async () => {
        const server = await start(require('../../src/app'));
        try {
            assert.strictEqual(await status(server, method, '/simple/jobs/1/no-bid', adminToken(2)), 403);
            assert.ok(!isRefused(await status(server, method, '/simple/jobs/1/no-bid', adminToken(3))));
        } finally {
            await server.close();
        }
    });
}
