const { test } = require('node:test');
const assert = require('node:assert');
const { start } = require('../helpers/server');
const { signPendingToken } = require('../../src/lib/mfaPending');
const { encryptSecret, decryptSecret } = require('../../src/lib/mfaSecret');
const jwt = require('jsonwebtoken');

process.env.TOTP_ENCRYPTION_KEY = 'ab'.repeat(32);

const SECRET = 'JBSWY3DPEHPK3PXP';
let qrFails = false;
const totpPath = require.resolve('../../src/lib/totp.js');
require.cache[totpPath] = {
    id: totpPath,
    filename: totpPath,
    loaded: true,
    exports: {
        generateSecret: () => SECRET,
        keyUri: (secret, label) => `otpauth://totp/${label}?secret=${secret}`,
        qrDataUrl: async () => { if (qrFails) throw new Error('no qrcode'); return 'data:image/png;base64,QR'; },
        verifyCode: (secret, code) => (secret === SECRET && code === '123456' ? 55 : null),
    },
};
const mailerPath = require.resolve('../../src/lib/mailer.js');
require.cache[mailerPath] = { id: mailerPath, filename: mailerPath, loaded: true, exports: { sendMail: async () => {} } };

let row;
let enableAffected;
const calls = [];
const fakeDb = {
    execute: async (sql, params) => {
        calls.push({ sql, params });
        if (/^SELECT \* FROM admin WHERE id/.test(sql)) return [[row]];
        if (/^SELECT failed_logins/.test(sql)) return [[{ failed_logins: 1 }]];
        if (/SET totp_enabled_at/.test(sql)) return [{ affectedRows: enableAffected }];
        return [{ affectedRows: 1 }];
    },
};
const dbPath = require.resolve('../../src/db/db.js');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: fakeDb };

const post = async (server, path, body) => {
    const res = await fetch(`${server.baseUrl}/api/admin/mfa${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
};
const reset = () => {
    calls.length = 0;
    qrFails = false;
    enableAffected = 1;
    row = { id: 7, email: 'a@x.com', name: 'Ann', access_level: 0, disabled: 0, email_verified_at: new Date(), totp_enabled_at: null, totp_secret: null, locked_until: null };
};
const pending = () => signPendingToken('admin', 7);

test('totp/setup stores the encrypted secret and returns secret, uri and qr', async () => {
    const server = await start(require('../../src/app'));
    try {
        reset();
        const ok = await post(server, '/totp/setup', { pendingToken: pending() });
        assert.strictEqual(ok.status, 200);
        assert.deepStrictEqual(ok.body, {
            secret: SECRET,
            uri: `otpauth://totp/a@x.com?secret=${SECRET}`,
            qr: 'data:image/png;base64,QR',
        });
        const update = calls.find((c) => /UPDATE admin SET totp_secret/.test(c.sql));
        assert.notStrictEqual(update.params[0], SECRET);
        assert.strictEqual(decryptSecret(update.params[0]), SECRET);
        assert.strictEqual(update.params[1], 7);

        qrFails = true;
        const noQr = await post(server, '/totp/setup', { pendingToken: pending() });
        assert.deepStrictEqual([noQr.status, noQr.body.qr, noQr.body.secret], [200, null, SECRET]);
    } finally {
        await server.close();
    }
});

test('totp/enable activates TOTP with a valid code and returns a session and backup codes', async () => {
    const server = await start(require('../../src/app'));
    try {
        reset();
        row.totp_secret = encryptSecret(SECRET);
        const ok = await post(server, '/totp/enable', { pendingToken: pending(), code: '123456' });
        assert.strictEqual(ok.status, 200);
        assert.strictEqual(ok.body.backupCodes.length, 10);
        assert.strictEqual(jwt.verify(ok.body.token, process.env.JWT_SECRET).id, 7);
        const enable = calls.find((c) => /SET totp_enabled_at = NOW\(\), totp_last_step = \?/.test(c.sql));
        assert.match(enable.sql, /AND totp_enabled_at IS NULL/);
        assert.deepStrictEqual(enable.params, [55, 7]);
        assert.ok(calls.some((c) => /DELETE FROM auth_backup_code/.test(c.sql)));
        assert.ok(calls.some((c) => /INSERT INTO auth_session/.test(c.sql)));
    } finally {
        await server.close();
    }
});

test('totp/enable rejects a bad code, a lost race and the wrong step', async () => {
    const server = await start(require('../../src/app'));
    try {
        reset();
        row.totp_secret = encryptSecret(SECRET);
        const bad = await post(server, '/totp/enable', { pendingToken: pending(), code: '000000' });
        assert.strictEqual(bad.status, 400);
        assert.strictEqual(bad.body.token, undefined);
        assert.ok(calls.some((c) => /SET failed_logins = failed_logins \+ 1/.test(c.sql)));
        assert.strictEqual(calls.some((c) => /SET totp_enabled_at/.test(c.sql)), false);

        enableAffected = 0;
        const raced = await post(server, '/totp/enable', { pendingToken: pending(), code: '123456' });
        assert.strictEqual(raced.status, 409);
        assert.strictEqual(raced.body.token, undefined);

        reset();
        const noSecret = await post(server, '/totp/enable', { pendingToken: pending(), code: '123456' });
        assert.strictEqual(noSecret.status, 409);

        row.totp_enabled_at = new Date();
        const done = await post(server, '/totp/enable', { pendingToken: pending(), code: '123456' });
        assert.deepStrictEqual([done.status, done.body.step], [409, 'enter_code']);
    } finally {
        await server.close();
    }
});
