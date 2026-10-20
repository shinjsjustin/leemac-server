const { test } = require('node:test');
const assert = require('node:assert');
const { start } = require('../helpers/server');
const { TEST_SID, clientToken } = require('../helpers/session');
const { hashPassword } = require('../../src/lib/auth');
const { encryptSecret } = require('../../src/lib/mfaSecret');

process.env.TOTP_ENCRYPTION_KEY = 'ab'.repeat(32);

const SECRET = 'JBSWY3DPEHPK3PXP';
const LOCKED_BODY = { error: 'Account locked. Try again later.' };
const HOUR_MS = 60 * 60 * 1000;
const totpPath = require.resolve('../../src/lib/totp.js');
require.cache[totpPath] = {
    id: totpPath,
    filename: totpPath,
    loaded: true,
    exports: { verifyCode: (secret, code) => (secret === SECRET && code === '123456' ? 55 : null) },
};
const mailerPath = require.resolve('../../src/lib/mailer.js');
require.cache[mailerPath] = { id: mailerPath, filename: mailerPath, loaded: true, exports: { sendMail: async () => {} } };

let row;
const calls = [];
const fakeDb = {
    execute: async (sql, params) => {
        calls.push({ sql, params });
        if (/FROM auth_session/.test(sql)) return [[{ id: TEST_SID }]];
        if (/^SELECT \* FROM clients WHERE id/.test(sql)) return [[row]];
        if (/^SELECT failed_logins/.test(sql)) return [[{ failed_logins: 1 }]];
        return [{ affectedRows: 1 }];
    },
};
const dbPath = require.resolve('../../src/db/db.js');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: fakeDb };

const sqlCalls = (re) => calls.filter((c) => re.test(c.sql));
const post = async (server, path, body) => {
    const res = await fetch(`${server.baseUrl}/api/client/mfa${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${clientToken({ id: 7, name: 'Acme', company_id: 3 })}` },
        body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
};
const withServer = async (overrides, fn) => {
    calls.length = 0;
    row = { id: 7, email: 'acme@x.com', name: 'Acme', company_id: 3, totp_enabled_at: null, totp_secret: null, locked_until: null, ...overrides };
    const server = await start(require('../../src/app'));
    try {
        await fn(server);
    } finally {
        await server.close();
    }
};
const assertNoWrites = () => {
    assert.strictEqual(sqlCalls(/UPDATE clients SET failed_logins/).length, 0);
    assert.strictEqual(sqlCalls(/UPDATE clients SET totp_/).length, 0);
    assert.strictEqual(sqlCalls(/DELETE FROM auth_backup_code/).length, 0);
};
const future = () => new Date(Date.now() + HOUR_MS);
const past = () => new Date(Date.now() - HOUR_MS);

test('enable is 423 for a locked client even with a valid code', async () => {
    await withServer({ totp_secret: encryptSecret(SECRET), locked_until: future() }, async (server) => {
        const res = await post(server, '/totp/enable', { code: '123456' });
        assert.deepStrictEqual([res.status, res.body], [423, LOCKED_BODY]);
        assertNoWrites();
    });
});

test('disable is 423 for a locked client even with the right password', async () => {
    await withServer({ totp_enabled_at: new Date(), password: await hashPassword('secret'), locked_until: future() }, async (server) => {
        const res = await post(server, '/totp/disable', { password: 'secret' });
        assert.deepStrictEqual([res.status, res.body], [423, LOCKED_BODY]);
        assertNoWrites();
    });
});

test('enable still works once the lock has expired', async () => {
    await withServer({ totp_secret: encryptSecret(SECRET), locked_until: past() }, async (server) => {
        const res = await post(server, '/totp/enable', { code: '123456' });
        assert.strictEqual(res.status, 200);
        assert.strictEqual(sqlCalls(/SET totp_enabled_at = NOW\(\)/).length, 1);
    });
});

test('disable still works once the lock has expired', async () => {
    await withServer({ totp_enabled_at: new Date(), password: await hashPassword('secret'), locked_until: past() }, async (server) => {
        const res = await post(server, '/totp/disable', { password: 'secret' });
        assert.strictEqual(res.status, 200);
        assert.strictEqual(sqlCalls(/DELETE FROM auth_backup_code/).length, 1);
    });
});
