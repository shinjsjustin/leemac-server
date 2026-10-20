const { test } = require('node:test');
const assert = require('node:assert');
const { start } = require('../helpers/server');
const { signPendingToken } = require('../../src/lib/mfaPending');
const { encryptSecret } = require('../../src/lib/mfaSecret');
const { hashBackupCode } = require('../../src/lib/backupCodes');

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
let stepAffected;
let unusedBackupHash;
const calls = [];
const fakeDb = {
    execute: async (sql, params) => {
        calls.push({ sql, params });
        if (/^SELECT \* FROM admin WHERE id/.test(sql)) return [[row]];
        if (/^SELECT failed_logins/.test(sql)) return [[{ failed_logins: 1 }]];
        if (/SET totp_last_step/.test(sql)) return [{ affectedRows: stepAffected }];
        if (/UPDATE auth_backup_code/.test(sql)) return [{ affectedRows: params[2] === unusedBackupHash ? 1 : 0 }];
        return [{ affectedRows: 1 }];
    },
};
const dbPath = require.resolve('../../src/db/db.js');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: fakeDb };

const post = async (server, body) => {
    const res = await fetch(`${server.baseUrl}/api/admin/mfa/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
};
const reset = () => {
    calls.length = 0;
    stepAffected = 1;
    unusedBackupHash = hashBackupCode('abcde-fghij');
    row = {
        id: 7, email: 'a@x.com', name: 'Ann', access_level: 0, disabled: 0, failed_logins: 2, locked_until: null,
        email_verified_at: new Date(), totp_enabled_at: new Date(), totp_secret: encryptSecret(SECRET),
    };
};
const pending = () => signPendingToken('admin', 7);
const sessionInserted = () => calls.some((c) => /INSERT INTO/.test(c.sql) && /session/i.test(c.sql));
const failureRecorded = () => calls.some((c) => /^SELECT failed_logins/.test(c.sql));
const cleared = () => calls.some((c) => /SET failed_logins = 0/.test(c.sql));

test('verify accepts a valid TOTP code, claims its step once and clears failures', async () => {
    const server = await start(require('../../src/app'));
    try {
        reset();
        const ok = await post(server, { pendingToken: pending(), code: ' 123456 ' });
        assert.strictEqual(ok.status, 200);
        assert.strictEqual(typeof ok.body.token, 'string');
        const claim = calls.find((c) => /SET totp_last_step/.test(c.sql));
        assert.match(claim.sql, /totp_last_step IS NULL OR totp_last_step < \?/);
        assert.deepStrictEqual(claim.params, [55, 7, 55]);
        assert.strictEqual(cleared(), true);
        assert.strictEqual(failureRecorded(), false);

        reset();
        stepAffected = 0;
        const replay = await post(server, { pendingToken: pending(), code: '123456' });
        assert.deepStrictEqual([replay.status, replay.body], [400, { error: 'Invalid code' }]);
        assert.strictEqual(failureRecorded(), true);
        assert.strictEqual(cleared(), false);
        assert.strictEqual(calls.some((c) => /UPDATE auth_backup_code/.test(c.sql)), false);
    } finally {
        await server.close();
    }
});

test('verify accepts an unused backup code once and rejects a used or wrong one', async () => {
    const server = await start(require('../../src/app'));
    try {
        reset();
        const ok = await post(server, { pendingToken: pending(), code: 'ABCDE-fghij' });
        assert.strictEqual(ok.status, 200);
        assert.strictEqual(typeof ok.body.token, 'string');
        assert.strictEqual(cleared(), true);
        assert.strictEqual(calls.some((c) => /SET totp_last_step/.test(c.sql)), false);

        reset();
        unusedBackupHash = null;
        const used = await post(server, { pendingToken: pending(), code: 'abcde-fghij' });
        assert.deepStrictEqual([used.status, used.body], [400, { error: 'Invalid code' }]);
        assert.strictEqual(failureRecorded(), true);
        assert.strictEqual(cleared(), false);

        reset();
        const wrong = await post(server, { pendingToken: pending(), code: '000000' });
        assert.deepStrictEqual([wrong.status, wrong.body], [400, { error: 'Invalid code' }]);
        assert.strictEqual(failureRecorded(), true);
        assert.strictEqual(calls.some((c) => /SET totp_last_step/.test(c.sql)), false);
    } finally {
        await server.close();
    }
});

test('verify rejects bad tokens, disabled, locked and wrong-step admins without a session', async () => {
    const server = await start(require('../../src/app'));
    try {
        reset();
        assert.strictEqual((await post(server, { pendingToken: 'junk', code: '123456' })).status, 401);
        row.disabled = 1;
        assert.strictEqual((await post(server, { pendingToken: pending(), code: '123456' })).status, 403);
        row.disabled = 0;
        row.locked_until = new Date(Date.now() + 60000);
        assert.strictEqual((await post(server, { pendingToken: pending(), code: '123456' })).status, 423);
        row.locked_until = null;
        row.totp_enabled_at = null;
        const wrong = await post(server, { pendingToken: pending(), code: '123456' });
        assert.deepStrictEqual([wrong.status, wrong.body], [409, { error: 'Wrong step', step: 'setup_totp' }]);
        assert.strictEqual(sessionInserted(), false);
        assert.strictEqual(calls.some((c) => /^UPDATE/.test(c.sql)), false);
    } finally {
        await server.close();
    }
});
