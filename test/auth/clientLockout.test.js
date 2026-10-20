const { test } = require('node:test');
const assert = require('node:assert');
const { start } = require('../helpers/server');
const { hashPassword } = require('../../src/lib/auth');
const { SESSION_HANDLER, clientToken } = require('../helpers/session');

const sent = [];
const mailerPath = require.resolve('../../src/lib/mailer.js');
require.cache[mailerPath] = { id: mailerPath, filename: mailerPath, loaded: true, exports: { sendMail: async (m) => { sent.push(m); } } };

let clientRow;
const calls = [];
const fakeDb = {
    execute: async (sql, params) => {
        calls.push({ sql, params });
        if (/FROM auth_session/.test(sql)) return [SESSION_HANDLER.rows];
        if (/SELECT \* FROM clients/.test(sql)) return [[clientRow]];
        if (/SELECT failed_logins FROM clients/.test(sql)) return [[{ failed_logins: clientRow.failed_logins + 1 }]];
        if (/failed_logins = 0, locked_until = \?/.test(sql)) return [{ affectedRows: 1 }];
        return [{}];
    },
};
const dbPath = require.resolve('../../src/db/db.js');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: fakeDb };

const updates = () => calls.filter((c) => /UPDATE clients SET failed_logins/.test(c.sql));
const inserts = () => calls.filter((c) => /INSERT INTO auth_session/.test(c.sql));

async function setup(extra) {
    calls.length = 0;
    sent.length = 0;
    clientRow = { id: 7, username: 'acme', name: 'Acme', company_id: 3, email: 'c@x.com', password: await hashPassword('pw'), failed_logins: 0, locked_until: null, ...extra };
}

async function call(server, method, path, body, token) {
    const res = await fetch(`${server.baseUrl}/api/client${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
}

test('client login: the 5th wrong password locks 15 minutes, resets the count and emails the owner', async () => {
    const server = await start(require('../../src/app'));
    try {
        await setup({ failed_logins: 3 });
        const fourth = await call(server, 'POST', '/login', { email: 'c@x.com', password: 'bad' });
        assert.strictEqual(fourth.status, 401);
        assert.match(updates()[0].sql, /failed_logins = failed_logins \+ 1 WHERE id = \?/);
        assert.deepStrictEqual(updates()[0].params, [7]);
        assert.strictEqual(sent.length, 0);

        await setup({ failed_logins: 4 });
        const before = Date.now();
        await call(server, 'POST', '/login', { email: 'c@x.com', password: 'bad' });
        assert.match(updates()[1].sql, /failed_logins = 0, locked_until = \?/);
        const minutes = (updates()[1].params[0].getTime() - before) / 60000;
        assert.ok(minutes > 14.9 && minutes < 15.1);
        assert.strictEqual(sent.length, 1);
        assert.strictEqual(sent[0].to, 'c@x.com');
        assert.strictEqual(inserts().length, 0);
    } finally {
        await server.close();
    }
});

test('client login: a locked client gets 423 with the right password and no session', async () => {
    const server = await start(require('../../src/app'));
    try {
        await setup({ locked_until: new Date(Date.now() + 60000) });
        const res = await call(server, 'POST', '/login', { email: 'c@x.com', password: 'pw' });
        assert.strictEqual(res.status, 423);
        assert.strictEqual(inserts().length, 0);
    } finally {
        await server.close();
    }
});

test('client login: a success clears failed_logins', async () => {
    const server = await start(require('../../src/app'));
    try {
        await setup({ failed_logins: 2 });
        const res = await call(server, 'POST', '/login', { email: 'c@x.com', password: 'pw' });
        assert.strictEqual(res.status, 200);
        assert.match(updates()[0].sql, /failed_logins = 0, locked_until = NULL/);
        assert.strictEqual(inserts().length, 1);
    } finally {
        await server.close();
    }
});

test('client change-password: wrong passwords count toward the lock', async () => {
    const server = await start(require('../../src/app'));
    try {
        await setup({ failed_logins: 1 });
        const pw = await call(server, 'PUT', '/change-password', { currentPassword: 'bad', newPassword: 'n' }, clientToken(clientRow));
        assert.strictEqual(pw.status, 400);
        assert.deepStrictEqual(updates()[0].params, [7]);

    } finally {
        await server.close();
    }
});
