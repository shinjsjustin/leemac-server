const { test } = require('node:test');
const assert = require('node:assert');
const { start } = require('../helpers/server');
const { signPendingToken } = require('../../src/lib/mfaPending');

const sent = [];
let sendFails = false;
const mailerPath = require.resolve('../../src/lib/mailer.js');
require.cache[mailerPath] = {
    id: mailerPath,
    filename: mailerPath,
    loaded: true,
    exports: { sendMail: async (m) => { if (sendFails) throw new Error('ses down'); sent.push(m); } },
};

let row;
let taken;
const calls = [];
const fakeDb = {
    execute: async (sql, params) => {
        calls.push({ sql, params });
        if (/^SELECT \* FROM admin WHERE id/.test(sql)) return [[row]];
        if (/^SELECT id FROM admin WHERE email/.test(sql)) return [taken ? [{ id: 9 }] : []];
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
    sent.length = 0;
    sendFails = false;
    taken = false;
    row = { id: 7, email: 'a@x.com', name: 'Ann', disabled: 0, email_verified_at: null, totp_enabled_at: null, totp_secret: null, locked_until: null };
};
const pending = () => signPendingToken('admin', 7);

test('mfa routes reject bad tokens, disabled and locked admins, and wrong steps', async () => {
    const server = await start(require('../../src/app'));
    try {
        reset();
        assert.strictEqual((await post(server, '/status', { pendingToken: 'junk' })).status, 401);
        assert.strictEqual((await post(server, '/status', { pendingToken: signPendingToken('client', 7) })).status, 401);

        row.disabled = 1;
        assert.strictEqual((await post(server, '/status', { pendingToken: pending() })).status, 403);

        row.disabled = 0;
        row.locked_until = new Date(Date.now() + 60000);
        assert.strictEqual((await post(server, '/status', { pendingToken: pending() })).status, 423);

        row.locked_until = null;
        const status = await post(server, '/status', { pendingToken: pending() });
        assert.deepStrictEqual([status.status, status.body], [200, { step: 'verify_email' }]);

        const wrong = await post(server, '/totp/setup', { pendingToken: pending() });
        assert.deepStrictEqual([wrong.status, wrong.body], [409, { error: 'Wrong step', step: 'verify_email' }]);
        assert.strictEqual(calls.some((c) => /UPDATE admin/.test(c.sql)), false);
    } finally {
        await server.close();
    }
});

test('email emails a verify link for a new address and changes no admin column', async () => {
    const server = await start(require('../../src/app'));
    try {
        reset();
        const ok = await post(server, '/email', { pendingToken: pending(), email: '  New@X.com ' });
        assert.strictEqual(ok.status, 200);
        const insert = calls.find((c) => /INSERT INTO auth_token/.test(c.sql));
        assert.deepStrictEqual(insert.params.slice(0, 5), ['verify_email', 'admin', 7, 'new@x.com', 'Ann']);
        assert.strictEqual(sent.length, 1);
        assert.strictEqual(sent[0].to, 'new@x.com');
        assert.match(sent[0].text, /\/verify-email\?token=[0-9a-f]{64}/);
        assert.strictEqual(calls.some((c) => /UPDATE admin/.test(c.sql)), false);

        sendFails = true;
        assert.strictEqual((await post(server, '/email', { pendingToken: pending(), email: 'new@x.com' })).status, 502);

        reset();
        taken = true;
        assert.strictEqual((await post(server, '/email', { pendingToken: pending(), email: 'new@x.com' })).status, 409);
        assert.strictEqual(sent.length, 0);
        assert.strictEqual(calls.some((c) => /INSERT INTO auth_token/.test(c.sql)), false);
    } finally {
        await server.close();
    }
});
