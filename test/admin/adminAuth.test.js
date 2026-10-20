const { test } = require('node:test');
const assert = require('node:assert');
const { verifyPendingToken } = require('../../src/lib/mfaPending');
const { start } = require('../helpers/server');
const { hashPassword, signClientToken } = require('../../src/lib/auth');
const { TEST_SID, SESSION_HANDLER, adminToken } = require('../helpers/session');

const sent = [];
const mailerPath = require.resolve('../../src/lib/mailer.js');
require.cache[mailerPath] = { id: mailerPath, filename: mailerPath, loaded: true, exports: { sendMail: async (m) => { sent.push(m); } } };

const adminRow = { id: 7, email: 'a@x.com', name: 'A', access_level: 1 };
const fakeDb = { calls: [], handlers: [] };
fakeDb.execute = async (sql, params) => {
    fakeDb.calls.push({ sql, params });
    const h = fakeDb.handlers.find((x) => x.match.test(sql));
    return [h ? h.rows : []];
};

const dbPath = require.resolve('../../src/db/db.js');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: fakeDb };

function setRows(handlers) {
    fakeDb.calls.length = 0;
    fakeDb.handlers = [SESSION_HANDLER, ...handlers];
}

async function call(server, method, path, { token, body } = {}) {
    const res = await fetch(`${server.baseUrl}/api/admin${path}`, {
        method,
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body || {}),
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
}

const tokenFor = (level) => adminToken({ ...adminRow, access_level: level });
const nonSessionCalls = () => fakeDb.calls.filter((c) => !/auth_session/.test(c.sql));

test('login refuses a disabled admin with 403 and returns a pending token for an enabled one', async () => {
    const server = await start(require('../../src/app'));
    try {
        const password = await hashPassword('pw');
        setRows([{ match: /FROM admin/, rows: [{ ...adminRow, password, disabled: 1 }] }]);
        const disabled = await call(server, 'POST', '/login', { body: { email: 'a@x.com', password: 'pw' } });
        assert.strictEqual(disabled.status, 403);
        assert.deepStrictEqual(disabled.body, { error: 'Account disabled' });

        setRows([{ match: /FROM admin/, rows: [{ ...adminRow, password, disabled: 0 }] }]);
        const ok = await call(server, 'POST', '/login', { body: { email: 'a@x.com', password: 'pw' } });
        assert.strictEqual(ok.status, 200);
        assert.strictEqual(ok.body.message, 'Two-factor required');
        assert.strictEqual(ok.body.step, 'verify_email');
        assert.strictEqual(ok.body.token, undefined);
        assert.deepStrictEqual(verifyPendingToken(ok.body.pendingToken), { userType: 'admin', userId: 7 });
        assert.ok(!fakeDb.calls.some((c) => /INSERT INTO auth_session/.test(c.sql)));

        const verified = { ...adminRow, password, disabled: 0, email_verified_at: new Date(), totp_enabled_at: new Date() };
        setRows([{ match: /FROM admin/, rows: [verified] }]);
        const code = await call(server, 'POST', '/login', { body: { email: 'a@x.com', password: 'pw' } });
        assert.strictEqual(code.body.step, 'enter_code');
    } finally {
        await server.close();
    }
});

test('register requires a level-3 admin token', async () => {
    const server = await start(require('../../src/app'));
    try {
        const body = { name: 'N', email: 'n@x.com', password: 'pw', title: 'T' };
        setRows([{ match: /INSERT INTO admin/, rows: { insertId: 99 } }]);

        assert.strictEqual((await call(server, 'POST', '/register', { body })).status, 401);
        const clientToken = signClientToken({ id: 1, username: 'u', name: 'n', company_id: 2 });
        assert.strictEqual((await call(server, 'POST', '/register', { token: clientToken, body })).status, 403);
        assert.strictEqual((await call(server, 'POST', '/register', { token: tokenFor(2), body })).status, 403);
        assert.strictEqual(nonSessionCalls().length, 0);

        const ok = await call(server, 'POST', '/register', { token: tokenFor(3), body });
        assert.strictEqual(ok.status, 201);
        assert.ok(fakeDb.calls.some((c) => /INSERT INTO admin/.test(c.sql)));
    } finally {
        await server.close();
    }
});

test('change-password needs a token and acts on req.user.id, ignoring a body email', async () => {
    const server = await start(require('../../src/app'));
    try {
        const password = await hashPassword('old');
        setRows([{ match: /FROM admin/, rows: [{ ...adminRow, password }] }]);
        const body = { email: 'victim@x.com', currentPassword: 'old', newPassword: 'new' };

        assert.strictEqual((await call(server, 'PUT', '/change-password', { body })).status, 401);
        assert.strictEqual(fakeDb.calls.length, 0);

        const ok = await call(server, 'PUT', '/change-password', { token: tokenFor(0), body });
        assert.strictEqual(ok.status, 200);
        const select = fakeDb.calls.find((c) => /SELECT \* FROM admin/.test(c.sql));
        assert.match(select.sql, /WHERE id = \?/);
        assert.deepStrictEqual(select.params, [7]);
        const update = fakeDb.calls.find((c) => /UPDATE admin/.test(c.sql));
        assert.match(update.sql, /WHERE id = \?/);
        assert.strictEqual(update.params[1], 7);
        const revoke = fakeDb.calls.find((c) => /UPDATE auth_session SET revoked_at/.test(c.sql) && /id <> \?/.test(c.sql));
        assert.deepStrictEqual(revoke.params, ['admin', 7, TEST_SID]);
        assert.ok(!fakeDb.calls.some((c) => (c.params || []).includes('victim@x.com')));
    } finally {
        await server.close();
    }
});

test('logout needs a token, revokes the caller sid and returns 200', async () => {
    const server = await start(require('../../src/app'));
    try {
        setRows([]);
        assert.strictEqual((await call(server, 'POST', '/logout')).status, 401);
        assert.strictEqual(fakeDb.calls.length, 0);

        const ok = await call(server, 'POST', '/logout', { token: tokenFor(0) });
        assert.strictEqual(ok.status, 200);
        const revoke = fakeDb.calls.find((c) => /UPDATE auth_session SET revoked_at/.test(c.sql));
        assert.deepStrictEqual(revoke.params, [TEST_SID]);
    } finally {
        await server.close();
    }
});

test('change-email needs a token and acts on req.user.id, ignoring a body currentEmail', async () => {
    const server = await start(require('../../src/app'));
    try {
        const password = await hashPassword('pw');
        setRows([{ match: /SELECT \* FROM admin WHERE id/, rows: [{ ...adminRow, password }] }]);
        const body = { currentEmail: 'victim@x.com', newEmail: 'new@x.com', password: 'pw' };

        assert.strictEqual((await call(server, 'PUT', '/change-email', { body })).status, 401);
        assert.strictEqual(nonSessionCalls().length, 0);

        sent.length = 0;
        const ok = await call(server, 'PUT', '/change-email', { token: tokenFor(0), body: { ...body, newEmail: ' New@X.com ' } });
        assert.strictEqual(ok.status, 200);
        assert.ok(!fakeDb.calls.some((c) => /UPDATE admin/.test(c.sql)));
        const insert = fakeDb.calls.find((c) => /INSERT INTO auth_token/.test(c.sql));
        assert.deepStrictEqual(insert.params.slice(0, 5), ['verify_email', 'admin', 7, 'new@x.com', 'A']);
        assert.strictEqual(sent.length, 1);
        assert.strictEqual(sent[0].to, 'new@x.com');
        assert.match(sent[0].text, /\/verify-email\?token=[0-9a-f]{64}/);
        assert.ok(!fakeDb.calls.some((c) => (c.params || []).includes('victim@x.com')));
    } finally {
        await server.close();
    }
});

test('change-password and change-email share one limiter: the 11th call gets 429', async () => {
    const server = await start(require('../../src/app'));
    try {
        // Earlier tests made 4 credential calls; 6 more reach the limit of 10.
        for (let i = 0; i < 6; i += 1) {
            assert.strictEqual((await call(server, 'PUT', '/change-email')).status, 401);
        }
        assert.strictEqual((await call(server, 'PUT', '/change-password')).status, 429);
    } finally {
        await server.close();
    }
});
