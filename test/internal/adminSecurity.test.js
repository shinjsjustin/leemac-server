const { test } = require('node:test');
const assert = require('node:assert');
const { start } = require('../helpers/server');
const { SESSION_HANDLER, adminToken: signAdminToken } = require('../helpers/session');

const fakeDb = { calls: [], updateAffected: 1 };
const run = async (sql, params) => {
    if (SESSION_HANDLER.match.test(sql)) return [SESSION_HANDLER.rows];
    fakeDb.calls.push({ sql, params });
    if (/UPDATE (admin|clients) /i.test(sql)) return [{ affectedRows: fakeDb.updateAffected }];
    return [{ affectedRows: 1 }];
};
fakeDb.query = run;
fakeDb.execute = run;

const dbPath = require.resolve('../../src/db/db.js');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: fakeDb };

const level3 = signAdminToken({ id: 7, email: 'a@x.com', name: 'A', access_level: 3 });
const level1 = signAdminToken({ id: 9, email: 'b@x.com', name: 'B', access_level: 1 });

async function post(server, path, body, token) {
    fakeDb.calls.length = 0;
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${server.baseUrl}/api/internal/admins/${path}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
}
const revokes = () => fakeDb.calls.filter((c) => /UPDATE auth_session SET revoked_at/.test(c.sql));
const nonSession = () => fakeDb.calls.filter((c) => !/auth_session/.test(c.sql));

test('force-logout revokes all sessions for admin and client users', async () => {
    const server = await start(require('../../src/app'));
    try {
        for (const userType of ['admin', 'client']) {
            const res = await post(server, 'force-logout', { userType, userId: 12 }, level3);
            assert.strictEqual(res.status, 200);
            assert.strictEqual(revokes().length, 1);
            assert.deepStrictEqual(revokes()[0].params, [userType, 12]);
        }
    } finally {
        await server.close();
    }
});

test('force-logout rejects bad userType and non-integer userId with 400', async () => {
    const server = await start(require('../../src/app'));
    try {
        const bodies = [
            { userType: 'root', userId: 1 },
            { userId: 1 },
            { userType: 'admin', userId: 'abc' },
            { userType: 'admin', userId: 1.5 },
            { userType: 'admin' },
        ];
        for (const body of bodies) {
            const res = await post(server, 'force-logout', body, level3);
            assert.strictEqual(res.status, 400, JSON.stringify(body));
            assert.strictEqual(revokes().length, 0);
        }
    } finally {
        await server.close();
    }
});

test('reset-2fa clears totp columns, deletes backup codes and revokes sessions', async () => {
    const server = await start(require('../../src/app'));
    try {
        const admin = await post(server, 'reset-2fa', { userType: 'admin', userId: 12 }, level3);
        assert.strictEqual(admin.status, 200);
        const [update, del] = nonSession();
        assert.match(update.sql, /UPDATE admin SET totp_secret = NULL, totp_enabled_at = NULL, totp_last_step = NULL WHERE id = \?/);
        assert.deepStrictEqual(update.params, [12]);
        assert.match(del.sql, /DELETE FROM auth_backup_code WHERE user_type = \? AND user_id = \?/);
        assert.deepStrictEqual(del.params, ['admin', 12]);
        assert.deepStrictEqual(revokes()[0].params, ['admin', 12]);

        const client = await post(server, 'reset-2fa', { userType: 'client', userId: 3 }, level3);
        assert.strictEqual(client.status, 200);
        assert.match(nonSession()[0].sql, /UPDATE clients SET totp_secret = NULL/);
    } finally {
        await server.close();
    }
});

test('reset-2fa returns 404 without deleting codes or revoking when no user', async () => {
    const server = await start(require('../../src/app'));
    try {
        fakeDb.updateAffected = 0;
        const res = await post(server, 'reset-2fa', { userType: 'admin', userId: 99 }, level3);
        assert.strictEqual(res.status, 404);
        assert.strictEqual(nonSession().length, 1);
        assert.strictEqual(revokes().length, 0);
    } finally {
        fakeDb.updateAffected = 1;
        await server.close();
    }
});

test('reset-2fa rejects bad input with 400', async () => {
    const server = await start(require('../../src/app'));
    try {
        const res = await post(server, 'reset-2fa', { userType: 'x', userId: 1 }, level3);
        assert.strictEqual(res.status, 400);
        assert.strictEqual(fakeDb.calls.length, 0);
    } finally {
        await server.close();
    }
});

test('both routes return 403 for level 1 and 401 without a token', async () => {
    const server = await start(require('../../src/app'));
    try {
        for (const path of ['force-logout', 'reset-2fa']) {
            const body = { userType: 'admin', userId: 12 };
            assert.strictEqual((await post(server, path, body, level1)).status, 403);
            assert.strictEqual(fakeDb.calls.length, 0);
            assert.strictEqual((await post(server, path, body)).status, 401);
            assert.strictEqual(fakeDb.calls.length, 0);
        }
    } finally {
        await server.close();
    }
});
