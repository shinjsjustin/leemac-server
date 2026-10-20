const { test } = require('node:test');
const assert = require('node:assert');
const { start } = require('../helpers/server');
const helpers = require('../helpers/session');

const mailerPath = require.resolve('../../src/lib/mailer.js');
require.cache[mailerPath] = {
    id: mailerPath,
    filename: mailerPath,
    loaded: true,
    exports: { sendMail: async () => {} },
};

let emailTaken;
const calls = [];
const fakeDb = {
    execute: async (sql, params) => {
        calls.push({ sql, params });
        if (/FROM auth_session/.test(sql)) return [helpers.SESSION_HANDLER.rows];
        if (/SELECT \* FROM clients WHERE email = \?/.test(sql)) return [emailTaken ? [{ id: 1 }] : []];
        if (/UPDATE auth_token SET used_at/.test(sql)) return [{ affectedRows: 1 }];
        if (/SELECT \* FROM auth_token/.test(sql)) return [[{ email: 'new@x.com', name: 'Newbie', company_id: 3 }]];
        if (/INSERT INTO clients/.test(sql)) return [{ insertId: 42 }];
        return [{ affectedRows: 1 }];
    },
};
const dbPath = require.resolve('../../src/db/db.js');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: fakeDb };

const sqlCalls = (re) => calls.filter((c) => re.test(c.sql));

async function accept(server) {
    const res = await fetch(`${server.baseUrl}/api/client/accept-invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: 'abc', password: 'pw123' }),
    });
    return res.status;
}

test('accept-invite: a taken email gets 409 without consuming the token or inserting', async () => {
    const server = await start(require('../../src/app'));
    try {
        emailTaken = true;
        calls.length = 0;
        assert.strictEqual(await accept(server), 409);
        assert.strictEqual(sqlCalls(/UPDATE auth_token/).length, 0);
        assert.strictEqual(sqlCalls(/INSERT INTO clients/).length, 0);
    } finally {
        await server.close();
    }
});

test('accept-invite: a free email consumes the token after the check and returns 201', async () => {
    const server = await start(require('../../src/app'));
    try {
        emailTaken = false;
        calls.length = 0;
        assert.strictEqual(await accept(server), 201);
        const order = calls.map((c) => c.sql.match(/SELECT \* FROM auth_token|SELECT \* FROM clients|UPDATE auth_token|INSERT INTO clients/)?.[0]).filter(Boolean);
        assert.deepStrictEqual(order, ['SELECT * FROM auth_token', 'SELECT * FROM clients', 'UPDATE auth_token', 'SELECT * FROM auth_token', 'INSERT INTO clients']);
    } finally {
        await server.close();
    }
});
