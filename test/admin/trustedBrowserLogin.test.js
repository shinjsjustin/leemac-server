const { test } = require('node:test');
const assert = require('node:assert');
const { start } = require('../helpers/server');
const { signPendingToken } = require('../../src/lib/mfaPending');
const { encryptSecret } = require('../../src/lib/mfaSecret');

process.env.TOTP_ENCRYPTION_KEY = 'ab'.repeat(32);

const SECRET = 'JBSWY3DPEHPK3PXP';
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
let deviceLive;
const calls = [];
const fakeDb = {
    execute: async (sql, params) => {
        calls.push({ sql, params });
        if (/^SELECT \* FROM admin WHERE id/.test(sql)) return [[row]];
        if (/^SELECT failed_logins/.test(sql)) return [[{ failed_logins: 1 }]];
        if (/UPDATE admin_trusted_device/.test(sql)) return [{ affectedRows: deviceLive ? 1 : 0 }];
        return [{ affectedRows: 1 }];
    },
};
const dbPath = require.resolve('../../src/db/db.js');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: fakeDb };

const post = async (server, path, body) => {
    const res = await fetch(`${server.baseUrl}/api/admin/mfa/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 (Macintosh) Safari/605.1' },
        body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
};
const reset = () => {
    calls.length = 0;
    deviceLive = true;
    row = {
        id: 7, email: 'a@x.com', name: 'Ann', access_level: 0, disabled: 0, failed_logins: 0, locked_until: null,
        email_verified_at: new Date(), totp_enabled_at: new Date(), totp_secret: encryptSecret(SECRET),
    };
};
const pending = () => signPendingToken('admin', 7);
const sessionInserted = () => calls.some((c) => /INSERT INTO/.test(c.sql) && /session/i.test(c.sql));
const deviceInserted = () => calls.filter((c) => /INSERT INTO admin_trusted_device/.test(c.sql));
const failureRecorded = () => calls.some((c) => /^SELECT failed_logins/.test(c.sql));

test('verify returns deviceToken only when trustBrowser is true and the code is valid', async () => {
    const server = await start(require('../../src/app'));
    try {
        reset();
        const trusted = await post(server, 'verify', { pendingToken: pending(), code: '123456', trustBrowser: true });
        assert.strictEqual(trusted.status, 200);
        assert.strictEqual(typeof trusted.body.token, 'string');
        assert.match(trusted.body.deviceToken, /^[0-9a-f]{64}$/);
        const [insert] = deviceInserted();
        assert.deepStrictEqual([insert.params[0], insert.params[2]], [7, 'Safari on macOS']);

        for (const trustBrowser of [undefined, false, 'true', 1]) {
            reset();
            const plain = await post(server, 'verify', { pendingToken: pending(), code: '123456', trustBrowser });
            assert.strictEqual(plain.status, 200);
            assert.deepStrictEqual(Object.keys(plain.body), ['token']);
            assert.strictEqual(deviceInserted().length, 0);
        }

        reset();
        const bad = await post(server, 'verify', { pendingToken: pending(), code: '000000', trustBrowser: true });
        assert.deepStrictEqual([bad.status, bad.body], [400, { error: 'Invalid code' }]);
        assert.strictEqual(deviceInserted().length, 0);
    } finally {
        await server.close();
    }
});

test('trusted returns a session for a valid device token on a Google-style pending token', async () => {
    const server = await start(require('../../src/app'));
    try {
        reset();
        const ok = await post(server, 'trusted', { pendingToken: pending(), deviceToken: 'abc' });
        assert.strictEqual(ok.status, 200);
        assert.strictEqual(typeof ok.body.token, 'string');
        assert.deepStrictEqual(Object.keys(ok.body), ['token']);
        assert.strictEqual(sessionInserted(), true);
        const use = calls.find((c) => /UPDATE admin_trusted_device/.test(c.sql));
        assert.strictEqual(use.params[1], 7);
    } finally {
        await server.close();
    }
});

test('trusted gives 403 for an unknown token without recording a failure or session', async () => {
    const server = await start(require('../../src/app'));
    try {
        reset();
        deviceLive = false;
        const res = await post(server, 'trusted', { pendingToken: pending(), deviceToken: 'stale' });
        assert.deepStrictEqual([res.status, res.body], [403, { error: 'Browser not trusted' }]);
        assert.strictEqual(failureRecorded(), false);
        assert.strictEqual(sessionInserted(), false);
        assert.strictEqual(calls.some((c) => /UPDATE admin SET failed_logins/.test(c.sql)), false);
    } finally {
        await server.close();
    }
});

test('trusted gives no session for bad pending, disabled, locked or not-set-up admins', async () => {
    const server = await start(require('../../src/app'));
    try {
        reset();
        assert.strictEqual((await post(server, 'trusted', { pendingToken: 'junk', deviceToken: 'abc' })).status, 401);
        row.disabled = 1;
        assert.strictEqual((await post(server, 'trusted', { pendingToken: pending(), deviceToken: 'abc' })).status, 403);
        row.disabled = 0;
        row.locked_until = new Date(Date.now() + 60000);
        assert.strictEqual((await post(server, 'trusted', { pendingToken: pending(), deviceToken: 'abc' })).status, 423);
        row.locked_until = null;
        row.totp_enabled_at = null;
        assert.strictEqual((await post(server, 'trusted', { pendingToken: pending(), deviceToken: 'abc' })).status, 409);
        row.totp_enabled_at = new Date();
        row.email_verified_at = null;
        assert.strictEqual((await post(server, 'trusted', { pendingToken: pending(), deviceToken: 'abc' })).status, 409);
        assert.strictEqual(sessionInserted(), false);
        assert.strictEqual(calls.some((c) => /UPDATE admin_trusted_device/.test(c.sql)), false);
    } finally {
        await server.close();
    }
});
