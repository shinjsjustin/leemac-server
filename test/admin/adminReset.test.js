const { test } = require('node:test');
const assert = require('node:assert');
const { start } = require('../helpers/server');

const sent = [];
const mailerPath = require.resolve('../../src/lib/mailer.js');
require.cache[mailerPath] = { id: mailerPath, filename: mailerPath, loaded: true, exports: { sendMail: async (m) => { sent.push(m); } } };

let user;
let tokenValid;
let adminDisabled = 0;
const calls = [];
const fakeDb = {
    execute: async (sql, params) => {
        calls.push({ sql, params });
        if (/^SELECT disabled FROM admin WHERE id = \?/.test(sql)) return [[{ disabled: adminDisabled }]];
        if (/^SELECT \* FROM admin WHERE email/.test(sql)) return [user ? [user] : []];
        if (/UPDATE auth_token SET used_at/.test(sql)) return [{ affectedRows: tokenValid ? 1 : 0 }];
        if (/SELECT \* FROM auth_token/.test(sql)) return [[{ user_id: 7, user_type: 'admin' }]];
        return [{ affectedRows: 1 }];
    },
};
const dbPath = require.resolve('../../src/db/db.js');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: fakeDb };

const post = async (server, path, body) => {
    const res = await fetch(`${server.baseUrl}/api/admin${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
};

test('admin forgot-password: known email gets one link, unknown or disabled gets 200 and no email', async () => {
    const server = await start(require('../../src/app'));
    try {
        calls.length = 0;
        sent.length = 0;
        user = { id: 7, name: 'Ann', email: 'a@x.com', disabled: 0 };
        const known = await post(server, '/forgot-password', { email: 'a@x.com' });
        assert.strictEqual(known.status, 200);
        assert.strictEqual(sent.length, 1);
        assert.match(sent[0].text, /reset-password\?type=admin&token=[0-9a-f]{64}/);

        sent.length = 0;
        user = undefined;
        const unknown = await post(server, '/forgot-password', { email: 'nobody@x.com' });
        assert.strictEqual(unknown.status, 200);
        assert.deepStrictEqual(unknown.body, known.body);
        user = { id: 7, name: 'Ann', email: 'a@x.com', disabled: 1 };
        assert.strictEqual((await post(server, '/forgot-password', { email: 'a@x.com' })).status, 200);
        assert.strictEqual(sent.length, 0);
    } finally {
        await server.close();
    }
});

test('admin reset-password: valid token sets the password and revokes sessions; bad input gets 400', async () => {
    const server = await start(require('../../src/app'));
    try {
        calls.length = 0;
        tokenValid = true;
        const ok = await post(server, '/reset-password', { token: 'abc', newPassword: 'newpw' });
        assert.strictEqual(ok.status, 200);
        assert.ok(calls.some((c) => /UPDATE admin SET password/.test(c.sql)));
        assert.ok(calls.some((c) => /UPDATE auth_session SET revoked_at/.test(c.sql)));

        calls.length = 0;
        tokenValid = false;
        assert.strictEqual((await post(server, '/reset-password', { token: 'used', newPassword: 'newpw' })).status, 400);
        assert.strictEqual((await post(server, '/reset-password', { newPassword: 'newpw' })).status, 400);
        assert.strictEqual((await post(server, '/reset-password', { token: 'abc' })).status, 400);
        assert.ok(!calls.some((c) => /UPDATE admin SET password/.test(c.sql)));
    } finally {
        await server.close();
    }
});

test('admin reset-password: a valid token for a disabled admin gets 400 and sets no password', async () => {
    const server = await start(require('../../src/app'));
    try {
        calls.length = 0;
        tokenValid = true;
        adminDisabled = 1;
        const res = await post(server, '/reset-password', { token: 'abc', newPassword: 'newpw' });
        assert.strictEqual(res.status, 400);
        assert.ok(!calls.some((c) => /UPDATE admin SET password/.test(c.sql)));
    } finally {
        adminDisabled = 0;
        await server.close();
    }
});
