const { test } = require('node:test');
const assert = require('node:assert');
const { start } = require('../helpers/server');
const { hashPassword } = require('../../src/lib/auth');
const { hashToken } = require('../../src/lib/authTokens');
const { SESSION_HANDLER, adminToken } = require('../helpers/session');
const { completeReset } = require('../../src/lib/passwordReset');

let adminRow;
let tokenRow;
let updateAffected;
const calls = [];
const fakeDb = {
    execute: async (sql, params) => {
        calls.push({ sql, params });
        if (/FROM auth_session/.test(sql)) return [SESSION_HANDLER.rows];
        if (/SELECT \* FROM admin WHERE id/.test(sql)) return [[adminRow]];
        if (/SELECT failed_logins FROM admin/.test(sql)) return [[{ failed_logins: 1 }]];
        if (/SELECT disabled FROM admin/.test(sql)) return [[{ disabled: 0 }]];
        if (/UPDATE auth_token SET used_at/.test(sql)) return [{ affectedRows: tokenRow ? 1 : 0 }];
        if (/SELECT \* FROM auth_token/.test(sql)) return [[tokenRow]];
        if (/UPDATE (admin|clients) SET totp_secret/.test(sql)) return [{ affectedRows: updateAffected }];
        return [{ affectedRows: 1 }];
    },
};
fakeDb.query = fakeDb.execute;
const dbPath = require.resolve('../../src/db/db.js');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: fakeDb };
const mailerPath = require.resolve('../../src/lib/mailer.js');
require.cache[mailerPath] = { id: mailerPath, filename: mailerPath, loaded: true, exports: { sendMail: async () => {} } };

const wipes = () => calls.filter((c) => /DELETE FROM admin_trusted_device WHERE admin_id = \?$/.test(c.sql));
const touchesDevices = () => calls.filter((c) => /admin_trusted_device/.test(c.sql));

async function setup() {
    calls.length = 0;
    updateAffected = 1;
    adminRow = { id: 7, name: 'A', email: 'a@x.com', access_level: 3, disabled: 0, password: await hashPassword('pw'), failed_logins: 0, locked_until: null };
    tokenRow = { user_id: 7, user_type: 'admin', purpose: 'reset', token_hash: hashToken('raw') };
}

async function changePassword(server, currentPassword) {
    const res = await fetch(`${server.baseUrl}/api/admin/change-password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken(adminRow)}` },
        body: JSON.stringify({ currentPassword, newPassword: 'new' }),
    });
    return res.status;
}

async function reset2fa(server, userType, userId) {
    const res = await fetch(`${server.baseUrl}/api/internal/admins/reset-2fa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken(adminRow)}` },
        body: JSON.stringify({ userType, userId }),
    });
    return res.status;
}

test('successful admin password change deletes that admin trusted devices', async () => {
    const server = await start(require('../../src/app'));
    try {
        await setup();
        assert.strictEqual(await changePassword(server, 'pw'), 200);
        assert.strictEqual(wipes().length, 1);
        assert.deepStrictEqual(wipes()[0].params, [7]);
    } finally {
        await server.close();
    }
});

test('failed admin password change deletes no trusted devices', async () => {
    const server = await start(require('../../src/app'));
    try {
        await setup();
        assert.strictEqual(await changePassword(server, 'wrong'), 400);
        assert.strictEqual(touchesDevices().length, 0);
    } finally {
        await server.close();
    }
});

test('completeReset for an admin deletes that admin trusted devices', async () => {
    await setup();
    assert.strictEqual(await completeReset({ db: fakeDb, userType: 'admin', token: 'raw', newPassword: 'new' }), true);
    assert.strictEqual(wipes().length, 1);
    assert.deepStrictEqual(wipes()[0].params, [7]);
});

test('completeReset for a client leaves trusted devices alone', async () => {
    await setup();
    assert.strictEqual(await completeReset({ db: fakeDb, userType: 'client', token: 'raw', newPassword: 'new' }), true);
    assert.strictEqual(touchesDevices().length, 0);
});

test('completeReset with an invalid link deletes no trusted devices', async () => {
    await setup();
    tokenRow = undefined;
    assert.strictEqual(await completeReset({ db: fakeDb, userType: 'admin', token: 'bad', newPassword: 'new' }), false);
    assert.strictEqual(touchesDevices().length, 0);
});

test('reset-2fa for an admin deletes that admin trusted devices', async () => {
    const server = await start(require('../../src/app'));
    try {
        await setup();
        assert.strictEqual(await reset2fa(server, 'admin', 12), 200);
        assert.strictEqual(wipes().length, 1);
        assert.deepStrictEqual(wipes()[0].params, [12]);
    } finally {
        await server.close();
    }
});

test('reset-2fa for a client leaves trusted devices alone', async () => {
    const server = await start(require('../../src/app'));
    try {
        await setup();
        assert.strictEqual(await reset2fa(server, 'client', 12), 200);
        assert.strictEqual(touchesDevices().length, 0);
    } finally {
        await server.close();
    }
});

test('reset-2fa for a missing admin deletes no trusted devices', async () => {
    const server = await start(require('../../src/app'));
    try {
        await setup();
        updateAffected = 0;
        assert.strictEqual(await reset2fa(server, 'admin', 12), 404);
        assert.strictEqual(touchesDevices().length, 0);
    } finally {
        await server.close();
    }
});
