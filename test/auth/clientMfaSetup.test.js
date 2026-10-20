const { test } = require('node:test');
const assert = require('node:assert');
const { start } = require('../helpers/server');
const { TEST_SID, clientToken, adminToken } = require('../helpers/session');
const { hashPassword } = require('../../src/lib/auth');
const { encryptSecret, decryptSecret } = require('../../src/lib/mfaSecret');

process.env.TOTP_ENCRYPTION_KEY = 'ab'.repeat(32);

const SECRET = 'JBSWY3DPEHPK3PXP';
const INSTALL_ERROR = 'TOTP needs npm install otpauth qrcode';
let qrFails = false;
let installMissing = false;
const totpPath = require.resolve('../../src/lib/totp.js');
require.cache[totpPath] = {
    id: totpPath,
    filename: totpPath,
    loaded: true,
    exports: {
        generateSecret: () => { if (installMissing) throw new Error(INSTALL_ERROR); return SECRET; },
        keyUri: (secret, label) => `otpauth://totp/${label}?secret=${secret}`,
        qrDataUrl: async () => { if (qrFails) throw new Error('no qrcode'); return 'data:image/png;base64,QR'; },
        verifyCode: (secret, code) => (secret === SECRET && code === '123456' ? 55 : null),
    },
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
const request = async (server, method, path, body, token = clientToken({ id: 7, name: 'Acme', company_id: 3 })) => {
    const res = await fetch(`${server.baseUrl}/api/client/mfa${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
};
const withServer = async (overrides, fn) => {
    calls.length = 0;
    qrFails = false;
    installMissing = false;
    row = { id: 7, email: 'acme@x.com', name: 'Acme', company_id: 3, totp_enabled_at: null, totp_secret: null, locked_until: null, ...overrides };
    const server = await start(require('../../src/app'));
    try {
        await fn(server);
    } finally {
        await server.close();
    }
};

test('mfa routes are client-only', async () => {
    await withServer({}, async (server) => {
        const admin = adminToken({ id: 1, email: 'a@x.com', access_level: 3 });
        assert.strictEqual((await request(server, 'GET', '/status', null, admin)).status, 403);
        assert.strictEqual((await request(server, 'POST', '/totp/setup', {}, admin)).status, 403);
    });
});

test('status reports whether two-factor is enabled', async () => {
    await withServer({}, async (server) => {
        assert.deepStrictEqual((await request(server, 'GET', '/status')).body, { enabled: false });
    });
    await withServer({ totp_enabled_at: new Date() }, async (server) => {
        assert.deepStrictEqual((await request(server, 'GET', '/status')).body, { enabled: true });
    });
});

test('setup stores the encrypted secret and returns secret, uri and qr', async () => {
    await withServer({}, async (server) => {
        const ok = await request(server, 'POST', '/totp/setup');
        assert.strictEqual(ok.status, 200);
        assert.deepStrictEqual(ok.body, { secret: SECRET, uri: `otpauth://totp/acme@x.com?secret=${SECRET}`, qr: 'data:image/png;base64,QR' });
        const update = sqlCalls(/UPDATE clients SET totp_secret/)[0];
        assert.notStrictEqual(update.params[0], SECRET);
        assert.strictEqual(decryptSecret(update.params[0]), SECRET);
        assert.strictEqual(update.params[1], 7);

        qrFails = true;
        const noQr = await request(server, 'POST', '/totp/setup');
        assert.deepStrictEqual([noQr.status, noQr.body.qr, noQr.body.secret], [200, null, SECRET]);
    });
});

test('setup is 409 when enabled and 503 when totp is not installed', async () => {
    await withServer({ totp_enabled_at: new Date() }, async (server) => {
        assert.strictEqual((await request(server, 'POST', '/totp/setup')).status, 409);
        assert.strictEqual(sqlCalls(/SET totp_secret/).length, 0);
    });
    await withServer({}, async (server) => {
        installMissing = true;
        const res = await request(server, 'POST', '/totp/setup');
        assert.deepStrictEqual([res.status, res.body], [503, { error: 'Two-factor is not available yet' }]);
    });
});

test('enable activates with a valid code and returns 10 backup codes', async () => {
    await withServer({ totp_secret: encryptSecret(SECRET) }, async (server) => {
        const ok = await request(server, 'POST', '/totp/enable', { code: '123456' });
        assert.strictEqual(ok.status, 200);
        assert.strictEqual(ok.body.backupCodes.length, 10);
        const enable = sqlCalls(/SET totp_enabled_at = NOW\(\), totp_last_step = \?/)[0];
        assert.match(enable.sql, /AND totp_enabled_at IS NULL/);
        assert.deepStrictEqual(enable.params, [55, 7]);
        assert.deepStrictEqual(sqlCalls(/INSERT INTO auth_backup_code/)[0].params.slice(0, 2), ['client', 7]);
    });
});

test('enable rejects a bad code, no secret and already enabled', async () => {
    await withServer({ totp_secret: encryptSecret(SECRET) }, async (server) => {
        const bad = await request(server, 'POST', '/totp/enable', { code: '000000' });
        assert.strictEqual(bad.status, 400);
        assert.strictEqual(sqlCalls(/UPDATE clients SET failed_logins = failed_logins \+ 1/).length, 1);
        assert.strictEqual(sqlCalls(/SET totp_enabled_at/).length, 0);
    });
    await withServer({}, async (server) => {
        assert.strictEqual((await request(server, 'POST', '/totp/enable', { code: '123456' })).status, 409);
    });
    await withServer({ totp_secret: encryptSecret(SECRET), totp_enabled_at: new Date() }, async (server) => {
        assert.strictEqual((await request(server, 'POST', '/totp/enable', { code: '123456' })).status, 409);
    });
});

test('disable with the right password clears two-factor and backup codes', async () => {
    await withServer({ totp_enabled_at: new Date(), totp_secret: encryptSecret(SECRET), password: await hashPassword('secret') }, async (server) => {
        const ok = await request(server, 'POST', '/totp/disable', { password: 'secret' });
        assert.strictEqual(ok.status, 200);
        const update = sqlCalls(/UPDATE clients SET totp_secret = NULL, totp_enabled_at = NULL, totp_last_step = NULL WHERE id = \?/)[0];
        assert.deepStrictEqual(update.params, [7]);
        assert.deepStrictEqual(sqlCalls(/DELETE FROM auth_backup_code/)[0].params, ['client', 7]);
    });
});

test('disable with a wrong password is 400 and records a failure', async () => {
    await withServer({ totp_enabled_at: new Date(), password: await hashPassword('secret') }, async (server) => {
        const bad = await request(server, 'POST', '/totp/disable', { password: 'nope' });
        assert.strictEqual(bad.status, 400);
        assert.strictEqual(sqlCalls(/UPDATE clients SET failed_logins = failed_logins \+ 1/).length, 1);
        assert.strictEqual(sqlCalls(/SET totp_secret = NULL/).length, 0);
        assert.strictEqual(sqlCalls(/DELETE FROM auth_backup_code/).length, 0);
    });
});
