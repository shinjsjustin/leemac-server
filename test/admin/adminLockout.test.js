const { test } = require('node:test');
const assert = require('node:assert');
const { start } = require('../helpers/server');
const { hashPassword } = require('../../src/lib/auth');
const { SESSION_HANDLER, adminToken } = require('../helpers/session');

const sent = [];
const mailerPath = require.resolve('../../src/lib/mailer.js');
require.cache[mailerPath] = { id: mailerPath, filename: mailerPath, loaded: true, exports: { sendMail: async (m) => { sent.push(m); } } };

let adminRow;
const calls = [];
const fakeDb = {
    execute: async (sql, params) => {
        calls.push({ sql, params });
        if (/FROM auth_session/.test(sql)) return [SESSION_HANDLER.rows];
        if (/SELECT \* FROM admin/.test(sql)) return [[adminRow]];
        if (/SELECT failed_logins FROM admin/.test(sql)) return [[{ failed_logins: adminRow.failed_logins + 1 }]];
        if (/failed_logins = 0, locked_until = \?/.test(sql)) return [{ affectedRows: 1 }];
        return [{}];
    },
};
const dbPath = require.resolve('../../src/db/db.js');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: fakeDb };

const updates = () => calls.filter((c) => /UPDATE admin SET failed_logins/.test(c.sql));
const inserts = () => calls.filter((c) => /INSERT INTO auth_session/.test(c.sql));

async function setup(extra) {
    calls.length = 0;
    sent.length = 0;
    adminRow = { id: 7, email: 'a@x.com', name: 'A', access_level: 1, disabled: 0, password: await hashPassword('pw'), failed_logins: 0, locked_until: null, ...extra };
}

async function call(server, method, path, body, token) {
    const res = await fetch(`${server.baseUrl}/api/admin${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
}

test('admin login: the 5th wrong password locks 15 minutes, resets the count and emails the owner', async () => {
    const server = await start(require('../../src/app'));
    try {
        await setup({ failed_logins: 3 });
        const fourth = await call(server, 'POST', '/login', { email: 'a@x.com', password: 'bad' });
        assert.strictEqual(fourth.status, 400);
        assert.match(updates()[0].sql, /failed_logins = failed_logins \+ 1 WHERE id = \?/);
        assert.deepStrictEqual(updates()[0].params, [7]);
        assert.strictEqual(sent.length, 0);

        await setup({ failed_logins: 4 });
        const before = Date.now();
        const fifth = await call(server, 'POST', '/login', { email: 'a@x.com', password: 'bad' });
        assert.strictEqual(fifth.status, 400);
        assert.match(updates()[1].sql, /failed_logins = 0, locked_until = \?/);
        const minutes = (updates()[1].params[0].getTime() - before) / 60000;
        assert.ok(minutes > 14.9 && minutes < 15.1);
        assert.strictEqual(sent.length, 1);
        assert.strictEqual(sent[0].to, 'a@x.com');
        assert.match(sent[0].subject, /locked/);
        assert.strictEqual(inserts().length, 0);
    } finally {
        await server.close();
    }
});

test('admin login: a locked admin gets 423 with the right password and no session', async () => {
    const server = await start(require('../../src/app'));
    try {
        await setup({ locked_until: new Date(Date.now() + 60000) });
        const res = await call(server, 'POST', '/login', { email: 'a@x.com', password: 'pw' });
        assert.strictEqual(res.status, 423);
        assert.strictEqual(inserts().length, 0);
        assert.strictEqual(updates().length, 0);
    } finally {
        await server.close();
    }
});

test('admin login: an expired lock lets the right password in and a success clears failed_logins', async () => {
    const server = await start(require('../../src/app'));
    try {
        await setup({ failed_logins: 2, locked_until: new Date(Date.now() - 60000) });
        const res = await call(server, 'POST', '/login', { email: 'a@x.com', password: 'pw' });
        assert.strictEqual(res.status, 200);
        assert.match(updates()[0].sql, /failed_logins = 0, locked_until = NULL/);
        assert.strictEqual(inserts().length, 1);
    } finally {
        await server.close();
    }
});

test('admin change-password: a wrong current password counts toward the lock', async () => {
    const server = await start(require('../../src/app'));
    try {
        await setup({ failed_logins: 4 });
        const res = await call(server, 'PUT', '/change-password', { currentPassword: 'bad', newPassword: 'n' }, adminToken(adminRow));
        assert.strictEqual(res.status, 400);
        assert.match(updates()[1].sql, /failed_logins = 0, locked_until = \?/);
        assert.strictEqual(sent.length, 1);
    } finally {
        await server.close();
    }
});
