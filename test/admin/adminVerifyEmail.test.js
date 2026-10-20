const { test } = require('node:test');
const assert = require('node:assert');
const { start } = require('../helpers/server');
const { SESSION_HANDLER, adminToken } = require('../helpers/session');

const sent = [];
let sendFails = false;
const mailerPath = require.resolve('../../src/lib/mailer.js');
require.cache[mailerPath] = {
    id: mailerPath,
    filename: mailerPath,
    loaded: true,
    exports: { sendMail: async (m) => { if (sendFails) throw new Error('ses down'); sent.push(m); } },
};

const adminRow = { id: 7, email: 'a@x.com', name: 'Ann', access_level: 0 };
let tokenRow;
let consumed;
let taken;
let adminDisabled;
const calls = [];
const fakeDb = {
    execute: async (sql, params) => {
        calls.push({ sql, params });
        if (SESSION_HANDLER.match.test(sql)) return [SESSION_HANDLER.rows];
        if (/^SELECT \* FROM admin WHERE id/.test(sql)) return [[adminRow]];
        if (/^SELECT disabled FROM admin WHERE id = \?/.test(sql)) return [[{ disabled: adminDisabled }]];
        if (/^SELECT id FROM admin WHERE email/.test(sql)) return [taken ? [{ id: 9 }] : []];
        if (/UPDATE auth_token SET used_at/.test(sql)) return [{ affectedRows: consumed ? 1 : 0 }];
        if (/SELECT \* FROM auth_token WHERE token_hash = \? AND purpose/.test(sql)) return [tokenRow ? [tokenRow] : []];
        if (/SELECT \* FROM auth_token/.test(sql)) return [[tokenRow]];
        return [{ affectedRows: 1 }];
    },
};
const dbPath = require.resolve('../../src/db/db.js');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: fakeDb };

const post = async (server, path, { token, body } = {}) => {
    const res = await fetch(`${server.baseUrl}/api/admin${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(body || {}),
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
};
const reset = () => { calls.length = 0; sent.length = 0; sendFails = false; taken = false; adminDisabled = 0; consumed = true; tokenRow = { user_id: 7, user_type: 'admin', email: 'new@x.com' }; };

test('verify-email needs an admin token, then emails a link to the current address', async () => {
    const server = await start(require('../../src/app'));
    try {
        reset();
        assert.strictEqual((await post(server, '/verify-email')).status, 401);
        assert.strictEqual(sent.length, 0);

        const ok = await post(server, '/verify-email', { token: adminToken(adminRow) });
        assert.strictEqual(ok.status, 200);
        const insert = calls.find((c) => /INSERT INTO auth_token/.test(c.sql));
        assert.deepStrictEqual(insert.params.slice(0, 5), ['verify_email', 'admin', 7, 'a@x.com', 'Ann']);
        assert.strictEqual(sent.length, 1);
        assert.strictEqual(sent[0].to, 'a@x.com');
        assert.match(sent[0].text, /\/verify-email\?token=[0-9a-f]{64}/);

        sendFails = true;
        assert.strictEqual((await post(server, '/verify-email', { token: adminToken(adminRow) })).status, 502);
    } finally {
        await server.close();
    }
});

test('change-email returns 502 when the link cannot be sent', async () => {
    const server = await start(require('../../src/app'));
    try {
        reset();
        sendFails = true;
        const { hashPassword } = require('../../src/lib/auth');
        adminRow.password = await hashPassword('pw');
        taken = false;
        const res = await fetch(`${server.baseUrl}/api/admin/change-email`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken(adminRow)}` },
            body: JSON.stringify({ newEmail: 'new@x.com', password: 'pw' }),
        });
        assert.strictEqual(res.status, 502);
        delete adminRow.password;
    } finally {
        await server.close();
    }
});

test('confirm sets email and email_verified_at for the token admin without a login', async () => {
    const server = await start(require('../../src/app'));
    try {
        reset();
        const ok = await post(server, '/verify-email/confirm', { body: { token: 'raw' } });
        assert.strictEqual(ok.status, 200);
        const update = calls.find((c) => /UPDATE admin SET email = \?, email_verified_at = NOW\(\) WHERE id = \?/.test(c.sql));
        assert.deepStrictEqual(update.params, ['new@x.com', 7]);
        const taken409 = calls.find((c) => /^SELECT id FROM admin WHERE email = \? AND id <> \?/.test(c.sql));
        assert.deepStrictEqual(taken409.params, ['new@x.com', 7]);
    } finally {
        await server.close();
    }
});

test('confirm gets 400 for a missing or bad token and sets nothing', async () => {
    const server = await start(require('../../src/app'));
    try {
        reset();
        assert.strictEqual((await post(server, '/verify-email/confirm')).status, 400);
        tokenRow = undefined;
        assert.strictEqual((await post(server, '/verify-email/confirm', { body: { token: 'bad' } })).status, 400);
        tokenRow = { user_id: 7, user_type: 'admin', email: 'new@x.com' };
        consumed = false;
        assert.strictEqual((await post(server, '/verify-email/confirm', { body: { token: 'raced' } })).status, 400);
        assert.ok(!calls.some((c) => /UPDATE admin/.test(c.sql)));
    } finally {
        await server.close();
    }
});

test('confirm gets 409 and leaves the token unused when another admin has the email', async () => {
    const server = await start(require('../../src/app'));
    try {
        reset();
        taken = true;
        const res = await post(server, '/verify-email/confirm', { body: { token: 'raw' } });
        assert.strictEqual(res.status, 409);
        assert.ok(!calls.some((c) => /UPDATE auth_token/.test(c.sql)));
        assert.ok(!calls.some((c) => /UPDATE admin/.test(c.sql)));
    } finally {
        await server.close();
    }
});

test('confirm gets 400 and changes nothing when the token admin is disabled', async () => {
    const server = await start(require('../../src/app'));
    try {
        reset();
        adminDisabled = 1;
        const res = await post(server, '/verify-email/confirm', { body: { token: 'raw' } });
        assert.strictEqual(res.status, 400);
        assert.deepStrictEqual(res.body, { error: 'Invalid or expired link' });
        const check = calls.find((c) => /^SELECT disabled FROM admin WHERE id = \?/.test(c.sql));
        assert.deepStrictEqual(check.params, [7]);
        assert.ok(!calls.some((c) => /UPDATE auth_token/.test(c.sql)));
        assert.ok(!calls.some((c) => /UPDATE admin/.test(c.sql)));
    } finally {
        await server.close();
    }
});
