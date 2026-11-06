const { test } = require('node:test');
const assert = require('node:assert');
const { start } = require('../helpers/server');
const { SESSION_HANDLER, adminToken: signAdminToken } = require('../helpers/session');

const fakeDb = {
    execute: async (sql) => [/FROM auth_session/.test(sql) ? SESSION_HANDLER.rows : []],
    query: async (sql) => [/FROM auth_session/.test(sql) ? SESSION_HANDLER.rows : []],
};
const dbPath = require.resolve('../../src/db/db.js');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: fakeDb };

const adminRow = { id: 7, email: 'a@x.com', name: 'A' };

test('GET /auth/google no longer redirects to Google', async () => {
    const server = await start(require('../../src/app'));
    try {
        const res = await fetch(`${server.baseUrl}/auth/google`, { redirect: 'manual' });
        const location = res.headers.get('location') || '';
        assert.doesNotMatch(location, /google/i);
    } finally {
        await server.close();
    }
});

test('a level-3 admin gets no Google auth URL', async () => {
    const server = await start(require('../../src/app'));
    try {
        const res = await fetch(`${server.baseUrl}/api/jarvis/google/auth-url`, {
            headers: { Authorization: `Bearer ${signAdminToken({ ...adminRow, access_level: 3 })}` },
        });
        const text = await res.text();
        assert.doesNotMatch(text, /authUrl/);
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
