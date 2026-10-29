const { test } = require('node:test');
const assert = require('node:assert');
const jwt = require('jsonwebtoken');
const { start } = require('../helpers/server');
const { SESSION_HANDLER, adminToken: signAdminToken, clientToken: signClientToken } = require('../helpers/session');

const fakeDb = {
    execute: async (sql) => [/FROM auth_session/.test(sql) ? SESSION_HANDLER.rows : []],
    query: async (sql) => [/FROM auth_session/.test(sql) ? SESSION_HANDLER.rows : []],
};
const dbPath = require.resolve('../../src/db/db.js');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: fakeDb };

const adminRow = { id: 7, email: 'a@x.com', name: 'A' };
const tokens = {
    client: () => signClientToken({ id: 3, username: 'c', name: 'C', company_id: 5 }),
    'role-less access 3': () => jwt.sign({ id: 7, access: 3 }, process.env.JWT_SECRET),
    'no access': () => jwt.sign({ id: 7, role: 'admin' }, process.env.JWT_SECRET),
    'level-2 admin': () => signAdminToken({ ...adminRow, access_level: 2 }),
};
const paths = ['/api/jarvis/google/check', '/api/jarvis/google/auth-url'];

async function get(server, path, token) {
    const res = await fetch(`${server.baseUrl}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    return res.status;
}

test('jarvis refuses client, role-less, access-less and level-2 tokens with 403', async () => {
    const server = await start(require('../../src/app'));
    try {
        for (const [name, make] of Object.entries(tokens)) {
            for (const path of paths) {
                assert.strictEqual(await get(server, path, make()), 403, `${name} ${path}`);
            }
        }
    } finally {
        await server.close();
    }
});

test('jarvis does not refuse a level-3 admin', async () => {
    const server = await start(require('../../src/app'));
    try {
        const status = await get(server, '/api/jarvis/google/auth-url', signAdminToken({ ...adminRow, access_level: 3 }));
        assert.ok(status !== 401 && status !== 403, `status ${status}`);
    } finally {
        await server.close();
    }
});

test('the removed Jarvis chat route answers 404', async () => {
    const server = await start(require('../../src/app'));
    try {
        const res = await fetch(`${server.baseUrl}/api/jarvis/chat`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${signAdminToken({ ...adminRow, access_level: 3 })}`, 'Content-Type': 'application/json' },
            body: '{}',
        });
        assert.strictEqual(res.status, 404);
    } finally {
        await server.close();
    }
});
