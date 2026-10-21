const { test } = require('node:test');
const assert = require('node:assert');
const { start } = require('../helpers/server');
const { hashPassword } = require('../../src/lib/auth');
const { signPendingToken } = require('../../src/lib/mfaPending');
const { SESSION_HANDLER, adminToken } = require('../helpers/session');

const ENABLED_AT = new Date('2026-01-01T00:00:00Z');
const PASSWORD = 'secret';
let passwordHash;

const emailOf = (n) => `user${n}@x.com`;
const rowOf = (n, totpEnabledAt) => ({
    id: n, email: emailOf(n), name: `User ${n}`, company_id: 3, password: passwordHash, totp_enabled_at: totpEnabledAt,
});
// Even ids have two-factor on, odd ids do not.
const clientById = (n) => rowOf(n, n % 2 === 0 ? ENABLED_AT : null);

const mailerPath = require.resolve('../../src/lib/mailer.js');
require.cache[mailerPath] = { id: mailerPath, filename: mailerPath, loaded: true, exports: { sendMail: async () => {} } };

async function fakeExecute(sql, params) {
    if (/FROM auth_session/.test(sql)) return [SESSION_HANDLER.rows];
    if (/SELECT \* FROM clients WHERE email = \? AND email_verified_at IS NOT NULL/.test(sql)) {
        const n = Number(/^user(\d+)@x\.com$/.exec(params[0])?.[1]);
        return [n ? [clientById(n)] : []];
    }
    if (/SELECT \* FROM clients WHERE id = \?/.test(sql)) return [[clientById(params[0])]];
    if (/SELECT \* FROM company/.test(sql)) return [[{ id: 3, name: 'Acme' }]];
    if (/^SELECT/.test(sql)) return [[]];
    return [{ affectedRows: 1, insertId: 1 }];
}
const dbPath = require.resolve('../../src/db/db.js');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { execute: fakeExecute, query: fakeExecute } };

async function post(server, path, body, token) {
    const res = await fetch(`${server.baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json().catch(() => ({})), headers: res.headers };
}

const clientLogin = (server, n) => post(server, '/api/client/login', { email: emailOf(n), password: PASSWORD });
const clientVerify = (server, n) => post(server, '/api/client/mfa/verify', {
    pendingToken: signPendingToken('client', n), code: 'abcde-fghij',
});

async function withServer(fn) {
    passwordHash ??= await hashPassword(PASSWORD);
    const server = await start(require('../../src/app'));
    try {
        await fn(server);
    } finally {
        await server.close();
    }
}

test('two client accounts on one IP each log in and verify 6 times without a 429', async () => {
    await withServer(async (server) => {
        for (const n of [2, 4]) {
            for (let i = 0; i < 6; i += 1) {
                assert.strictEqual((await clientLogin(server, n)).status, 200);
                assert.strictEqual((await clientVerify(server, n)).status, 200);
            }
        }
    });
});

test('an account hits 429 on its 11th login while another account on the same IP still gets 200', async () => {
    await withServer(async (server) => {
        for (let i = 0; i < 10; i += 1) assert.strictEqual((await clientLogin(server, 6)).status, 200);
        const blocked = await clientLogin(server, 6);
        assert.strictEqual(blocked.status, 429);
        assert.match(blocked.headers.get('retry-after'), /^\d+$/);
        assert.strictEqual((await clientLogin(server, 8)).status, 200);
    });
});

test('11 forgot-password calls for one email block only that email, not other emails or login', async () => {
    await withServer(async (server) => {
        for (let i = 0; i < 10; i += 1) {
            assert.strictEqual((await post(server, '/api/client/forgot-password', { email: emailOf(10) })).status, 200);
        }
        assert.strictEqual((await post(server, '/api/client/forgot-password', { email: emailOf(10) })).status, 429);
        assert.strictEqual((await post(server, '/api/client/forgot-password', { email: emailOf(12) })).status, 200);
        assert.strictEqual((await clientLogin(server, 12)).status, 200);
    });
});

test('a level-3 admin gets 50 invites past the limiter and the 51st gets 429', async () => {
    await withServer(async (server) => {
        const token = adminToken({ id: 1, email: 'a@b.c', access_level: 3 });
        for (let i = 0; i < 50; i += 1) {
            assert.notStrictEqual((await post(server, '/api/client/invite', { email: 'nope' }, token)).status, 429);
        }
        assert.strictEqual((await post(server, '/api/client/invite', { email: 'nope' }, token)).status, 429);
    });
});

test('31 admin reset-password calls hit 429 on the 31st and leave admin login unblocked', async () => {
    await withServer(async (server) => {
        for (let i = 0; i < 30; i += 1) {
            assert.strictEqual((await post(server, '/api/admin/reset-password', {})).status, 400);
        }
        assert.strictEqual((await post(server, '/api/admin/reset-password', {})).status, 429);
        const login = await post(server, '/api/admin/login', { email: 'a@x.com', password: PASSWORD });
        assert.notStrictEqual(login.status, 429);
    });
});

test('cors exposes Retry-After and RateLimit-Reset to the browser', async () => {
    await withServer(async (server) => {
        const res = await fetch(`${server.baseUrl}/api/client/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
            body: JSON.stringify({ email: emailOf(14), password: PASSWORD }),
        });
        assert.strictEqual(res.headers.get('access-control-expose-headers'), 'Retry-After,RateLimit-Reset');
    });
});
