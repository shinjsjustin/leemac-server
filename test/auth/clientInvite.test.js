const { test } = require('node:test');
const assert = require('node:assert');
const jwt = require('jsonwebtoken');
const { start } = require('../helpers/server');
const helpers = require('../helpers/session');
const { verifyPassword } = require('../../src/lib/auth');

const sent = [];
let sendFails = false;
const mailerPath = require.resolve('../../src/lib/mailer.js');
require.cache[mailerPath] = {
    id: mailerPath,
    filename: mailerPath,
    loaded: true,
    exports: { sendMail: async (m) => { if (sendFails) throw new Error('smtp down'); sent.push(m); } },
};

let company;
let emailTaken;
let tokenRow;
const calls = [];
const fakeDb = {
    execute: async (sql, params) => {
        calls.push({ sql, params });
        if (/FROM auth_session/.test(sql)) return [helpers.SESSION_HANDLER.rows];
        if (/FROM company WHERE id = \?/.test(sql)) return [company ? [company] : []];
        if (/SELECT \* FROM clients WHERE email = \?/.test(sql)) return [emailTaken ? [{ id: 1 }] : []];
        if (/UPDATE auth_token SET used_at/.test(sql)) return [{ affectedRows: tokenRow ? 1 : 0 }];
        if (/SELECT \* FROM auth_token/.test(sql)) return [[tokenRow]];
        if (/INSERT INTO clients/.test(sql)) return [{ insertId: 42 }];
        return [{ affectedRows: 1 }];
    },
};
const dbPath = require.resolve('../../src/db/db.js');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: fakeDb };

const adminToken = (access) => helpers.adminToken({ id: 1, email: 'a@b.c', access_level: access });
const sqlCalls = (re) => calls.filter((c) => re.test(c.sql));

async function post(server, path, body, token) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${server.baseUrl}/api/client${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
    return { status: res.status, body: await res.json().catch(() => ({})) };
}

// inviteLimiter allows 50 calls per admin per hour, far above this file's total.
const INVITE = { email: '  New@X.com ', name: 'Newbie', company_id: 3 };

test('invite: validates input, company and duplicate email before sending anything', async () => {
    const server = await start(require('../../src/app'));
    try {
        company = { id: 3, name: 'Acme' };
        emailTaken = false;
        const token = adminToken(3);
        for (const bad of [
            { ...INVITE, email: 'nope' },
            { ...INVITE, company_id: 'abc' },
        ]) {
            assert.strictEqual((await post(server, '/invite', bad, token)).status, 400);
        }
        company = undefined;
        assert.strictEqual((await post(server, '/invite', INVITE, token)).status, 404);
        company = { id: 3, name: 'Acme' };
        emailTaken = true;
        assert.strictEqual((await post(server, '/invite', INVITE, token)).status, 409);
        assert.strictEqual(sent.length, 0);
        assert.strictEqual(sqlCalls(/INSERT INTO auth_token/).length, 0);
    } finally {
        await server.close();
    }
});

test('invite: stores a client invite token for the normalized email, emails the link, returns 201; send failure is 502', async () => {
    const server = await start(require('../../src/app'));
    try {
        company = { id: 3, name: 'Acme' };
        emailTaken = false;
        calls.length = 0;
        const ok = await post(server, '/invite', INVITE, adminToken(3));
        assert.strictEqual(ok.status, 201);
        const insert = sqlCalls(/INSERT INTO auth_token/)[0];
        assert.deepStrictEqual(
            [insert.params[0], insert.params[1], insert.params[3], insert.params[4], insert.params[5], insert.params[7]],
            ['invite', 'client', 'new@x.com', 'Newbie', 3, 1]
        );
        assert.strictEqual(sent.length, 1);
        assert.strictEqual(sent[0].to, 'new@x.com');
        assert.match(sent[0].text, /accept-invite\?token=[0-9a-f]{64}/);
        assert.match(sent[0].subject, /Acme/);

        sendFails = true;
        assert.strictEqual((await post(server, '/invite', INVITE, adminToken(3))).status, 502);
        sendFails = false;
    } finally {
        await server.close();
    }
});

test('accept-invite: valid token inserts the verified client and returns a session; bad input or token inserts nothing', async () => {
    const server = await start(require('../../src/app'));
    try {
        emailTaken = false;
        calls.length = 0;
        tokenRow = { email: 'new@x.com', name: 'Newbie', company_id: 3 };
        const ok = await post(server, '/accept-invite', { token: 'abc', password: 'pw123' });
        assert.strictEqual(ok.status, 201);
        const payload = jwt.verify(ok.body.token, process.env.JWT_SECRET);
        assert.deepStrictEqual([payload.role, payload.id, payload.company_id], ['client', 42, 3]);
        const insert = sqlCalls(/INSERT INTO clients/)[0];
        assert.match(insert.sql, /email_verified_at/);
        assert.match(insert.sql, /NOW\(\)/);
        assert.deepStrictEqual([insert.params[0], insert.params[1], insert.params[3]], ['new@x.com', 'Newbie', 3]);
        assert.notStrictEqual(insert.params[2], 'pw123');
        assert.ok(await verifyPassword('pw123', insert.params[2]));

        calls.length = 0;
        emailTaken = true;
        assert.strictEqual((await post(server, '/accept-invite', { token: 'abc', password: 'pw123' })).status, 409);
        emailTaken = false;
        tokenRow = undefined;
        assert.strictEqual((await post(server, '/accept-invite', { token: 'used', password: 'pw123' })).status, 400);
        assert.strictEqual((await post(server, '/accept-invite', {})).status, 400);
        assert.strictEqual(sqlCalls(/INSERT INTO clients/).length, 0);
    } finally {
        await server.close();
    }
});
