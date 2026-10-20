const { test } = require('node:test');
const assert = require('node:assert');
const { start } = require('../helpers/server');
const { hashPassword } = require('../../src/lib/auth');
const { SESSION_HANDLER, clientToken, adminToken } = require('../helpers/session');

const mailerPath = require.resolve('../../src/lib/mailer.js');
require.cache[mailerPath] = { id: mailerPath, filename: mailerPath, loaded: true, exports: { sendMail: async () => {} } };

let row;
const calls = [];
const fakeDb = {
    execute: async (sql, params) => {
        calls.push({ sql, params });
        if (/FROM auth_session/.test(sql)) return [SESSION_HANDLER.rows];
        if (/SELECT \* FROM (clients|admin)/.test(sql)) return [[row]];
        return [{}];
    },
};
const dbPath = require.resolve('../../src/db/db.js');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: fakeDb };

const writes = () => calls.filter((c) => /UPDATE (clients|admin) SET (password|failed_logins)/.test(c.sql));

async function setup(extra) {
    calls.length = 0;
    row = { id: 7, username: 'acme', name: 'Acme', company_id: 3, email: 'c@x.com', access_level: 1, disabled: 0, password: await hashPassword('pw'), failed_logins: 0, locked_until: null, ...extra };
}

async function put(server, role, token) {
    const res = await fetch(`${server.baseUrl}/api/${role}/change-password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ currentPassword: 'pw', newPassword: 'new' }),
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
}

const LOCKED = { error: 'Account locked. Try again later.' };

test('client change-password: a locked client gets 423 with the right password and no update', async () => {
    const server = await start(require('../../src/app'));
    try {
        await setup({ locked_until: new Date(Date.now() + 60000) });
        const res = await put(server, 'client', clientToken(row));
        assert.strictEqual(res.status, 423);
        assert.deepStrictEqual(res.body, LOCKED);
        assert.strictEqual(writes().length, 0);
    } finally {
        await server.close();
    }
});

test('admin change-password: a locked admin gets 423 with the right password and no update', async () => {
    const server = await start(require('../../src/app'));
    try {
        await setup({ locked_until: new Date(Date.now() + 60000) });
        const res = await put(server, 'admin', adminToken(row));
        assert.strictEqual(res.status, 423);
        assert.deepStrictEqual(res.body, LOCKED);
        assert.strictEqual(writes().length, 0);
    } finally {
        await server.close();
    }
});

test('client change-password: an unlocked client still changes the password', async () => {
    const server = await start(require('../../src/app'));
    try {
        await setup();
        const res = await put(server, 'client', clientToken(row));
        assert.strictEqual(res.status, 200);
        assert.strictEqual(writes().length, 1);
        assert.match(writes()[0].sql, /SET password = \?/);
    } finally {
        await server.close();
    }
});
