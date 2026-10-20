const { test } = require('node:test');
const assert = require('node:assert');
const jwt = require('jsonwebtoken');
const { start } = require('../helpers/server');
const { hashPassword } = require('../../src/lib/auth');
const { verifyPendingToken } = require('../../src/lib/mfaPending');

const CLIENT_ROW = { id: 7, email: 'acme@x.com', name: 'Acme', company_id: 3 };
const ENABLED_AT = new Date('2026-01-01T00:00:00Z');
const calls = [];
let clientRow;

async function fakeExecute(sql, params) {
    calls.push({ sql, params });
    if (/SELECT \* FROM clients WHERE email = \? AND email_verified_at IS NOT NULL/.test(sql)) return [[clientRow]];
    if (/SELECT failed_logins FROM clients/.test(sql)) return [[{ failed_logins: 1 }]];
    return [{}];
}

const mailerPath = require.resolve('../../src/lib/mailer.js');
require.cache[mailerPath] = { id: mailerPath, filename: mailerPath, loaded: true, exports: { sendMail: async () => {} } };

const dbPath = require.resolve('../../src/db/db.js');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { execute: fakeExecute, query: fakeExecute } };

const sqlCalls = (re) => calls.filter((c) => re.test(c.sql));

async function login(server, password) {
    const res = await fetch(`${server.baseUrl}/api/client/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'acme@x.com', password }),
    });
    return { status: res.status, body: await res.json() };
}

async function withServer(row, fn) {
    clientRow = { ...CLIENT_ROW, password: await hashPassword('secret'), ...row };
    calls.length = 0;
    const server = await start(require('../../src/app'));
    try {
        await fn(server);
    } finally {
        await server.close();
    }
}

test('client with two-factor on gets a pending token and no session', async () => {
    await withServer({ totp_enabled_at: ENABLED_AT }, async (server) => {
        const res = await login(server, 'secret');
        assert.strictEqual(res.status, 200);
        assert.deepStrictEqual(Object.keys(res.body).sort(), ['message', 'pendingToken', 'step']);
        assert.strictEqual(res.body.message, 'Two-factor required');
        assert.strictEqual(res.body.step, 'enter_code');
        assert.deepStrictEqual(verifyPendingToken(res.body.pendingToken), { userType: 'client', userId: 7 });
        assert.strictEqual(sqlCalls(/INSERT INTO auth_session/).length, 0);
    });
});

test('client with two-factor off still gets a session token', async () => {
    await withServer({ totp_enabled_at: null }, async (server) => {
        const res = await login(server, 'secret');
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.message, 'Login Success');
        assert.strictEqual(jwt.verify(res.body.token, process.env.JWT_SECRET).id, 7);
        assert.strictEqual(sqlCalls(/INSERT INTO auth_session/).length, 1);
    });
});

test('locked client with two-factor on gets 423', async () => {
    await withServer({ totp_enabled_at: ENABLED_AT, locked_until: new Date(Date.now() + 600000) }, async (server) => {
        const res = await login(server, 'secret');
        assert.strictEqual(res.status, 423);
        assert.strictEqual(res.body.pendingToken, undefined);
    });
});

test('wrong password with two-factor on gets 401 and records a failure', async () => {
    await withServer({ totp_enabled_at: ENABLED_AT }, async (server) => {
        const res = await login(server, 'bad');
        assert.strictEqual(res.status, 401);
        assert.strictEqual(res.body.pendingToken, undefined);
        assert.strictEqual(sqlCalls(/UPDATE clients SET failed_logins = failed_logins \+ 1/).length, 1);
    });
});
