const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const { start } = require('../helpers/server');
const { TEST_SID, SESSION_HANDLER, adminToken } = require('../helpers/session');

const fakeDb = { calls: [], rows: [SESSION_HANDLER.rows], fail: false };
fakeDb.execute = async (sql, params) => {
    fakeDb.calls.push({ sql, params });
    if (fakeDb.fail) throw new Error('db down: secret');
    return [fakeDb.rows[0]];
};
fakeDb.query = fakeDb.execute;
const dbPath = require.resolve('../../src/db/db.js');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: fakeDb };

const isAuth = require('../../src/middleware/isAuth');

async function call(token) {
    const app = express();
    app.get('/', isAuth, (req, res) => res.json({ user: req.user }));
    const s = await start(app);
    try {
        const res = await fetch(s.baseUrl, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
        return { status: res.status, body: await res.json() };
    } finally {
        await s.close();
    }
}
const reset = (rows = SESSION_HANDLER.rows, fail = false) => {
    fakeDb.calls.length = 0;
    fakeDb.rows = [rows];
    fakeDb.fail = fail;
};
const row = { id: 7, email: 'a@x.com', access_level: 2 };

test('401 Token is NULL with no token and no db call', async () => {
    reset();
    const r = await call();
    assert.equal(r.status, 401);
    assert.deepEqual(r.body, { message: 'Token is NULL' });
    assert.equal(fakeDb.calls.length, 0);
});

test('403 Token is INVALID for a bad signature', async () => {
    reset();
    const r = await call(jwt.sign({ role: 'admin', sid: TEST_SID }, 'wrong'));
    assert.equal(r.status, 403);
    assert.deepEqual(r.body, { message: 'Token is INVALID' });
});

test('403 when sid is missing or not a string, or role is missing', async () => {
    reset();
    for (const payload of [{ role: 'admin', id: 7 }, { role: 'admin', id: 7, sid: 5 }, { id: 7, sid: TEST_SID }]) {
        const r = await call(jwt.sign(payload, process.env.JWT_SECRET));
        assert.equal(r.status, 403, JSON.stringify(payload));
    }
    assert.equal(fakeDb.calls.length, 0);
});

test('401 Session expired when no live session row', async () => {
    reset([]);
    const r = await call(adminToken(row));
    assert.equal(r.status, 401);
    assert.deepEqual(r.body, { message: 'Session expired' });
});

test('looks up the session by sid, role and user id, then sets req.user', async () => {
    reset();
    const r = await call(adminToken(row));
    assert.equal(r.status, 200);
    assert.equal(r.body.user.id, 7);
    assert.deepEqual(fakeDb.calls[0].params, [TEST_SID, 'admin', 7]);
});

test('500 without leaking detail on a db error', async () => {
    reset(SESSION_HANDLER.rows, true);
    const r = await call(adminToken(row));
    assert.equal(r.status, 500);
    assert.doesNotMatch(JSON.stringify(r.body), /secret/);
});
