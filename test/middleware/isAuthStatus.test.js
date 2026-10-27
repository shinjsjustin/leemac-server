const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const { start } = require('../helpers/server');
const { TEST_SID, SESSION_HANDLER, adminToken } = require('../helpers/session');

const fakeDb = { rows: [SESSION_HANDLER.rows] };
fakeDb.execute = async () => [fakeDb.rows[0]];
fakeDb.query = fakeDb.execute;
const dbPath = require.resolve('../../src/db/db.js');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: fakeDb };

const isAuth = require('../../src/middleware/isAuth');
const { createIsAuth } = isAuth;

async function call(middleware, token) {
    const app = express();
    app.get('/', middleware, (req, res) => res.json({ user: req.user }));
    const s = await start(app);
    try {
        const res = await fetch(s.baseUrl, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
        return { status: res.status, body: await res.json() };
    } finally {
        await s.close();
    }
}

const secret = () => process.env.JWT_SECRET;
const badTokens = () => [
    jwt.sign({ role: 'admin', sid: TEST_SID }, 'wrong'),
    jwt.sign({ id: 7, sid: TEST_SID }, secret()),
    jwt.sign({ role: 'admin', id: 7, sid: TEST_SID, purpose: 'mfa' }, secret()),
];

test('createIsAuth({ invalidTokenStatus: 401 }) answers 401 Token is INVALID for bad, role-less and purpose tokens', async () => {
    const mw = createIsAuth({ invalidTokenStatus: 401 });
    for (const t of badTokens()) {
        const r = await call(mw, t);
        assert.equal(r.status, 401);
        assert.deepEqual(r.body, { message: 'Token is INVALID' });
    }
});

test('createIsAuth({ invalidTokenStatus: 401 }) still 401 for no token and passes a valid one', async () => {
    const mw = createIsAuth({ invalidTokenStatus: 401 });
    const none = await call(mw);
    assert.equal(none.status, 401);
    assert.deepEqual(none.body, { message: 'Token is NULL' });
    const ok = await call(mw, adminToken({ id: 7, email: 'a@x.com', access_level: 2 }));
    assert.equal(ok.status, 200);
});

test('default export and createIsAuth() still answer 403 for invalid tokens', async () => {
    for (const mw of [isAuth, createIsAuth()]) {
        for (const t of badTokens()) assert.equal((await call(mw, t)).status, 403);
    }
});
