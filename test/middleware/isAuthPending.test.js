const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const { start } = require('../helpers/server');
const { TEST_SID, SESSION_HANDLER } = require('../helpers/session');

const fakeDb = { calls: [] };
fakeDb.execute = async (sql, params) => {
    fakeDb.calls.push({ sql, params });
    return [SESSION_HANDLER.rows];
};
fakeDb.query = fakeDb.execute;
const dbPath = require.resolve('../../src/db/db.js');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: fakeDb };

const isAuth = require('../../src/middleware/isAuth');
const { signPendingToken } = require('../../src/lib/mfaPending');

async function call(token) {
    const app = express();
    app.get('/', isAuth, (req, res) => res.json({ ok: true }));
    const s = await start(app);
    try {
        const res = await fetch(s.baseUrl, { headers: { Authorization: `Bearer ${token}` } });
        return { status: res.status, body: await res.json() };
    } finally {
        await s.close();
    }
}

test('403 for a pending token with no session query', async () => {
    fakeDb.calls.length = 0;
    const r = await call(signPendingToken('admin', 7));
    assert.equal(r.status, 403);
    assert.deepEqual(r.body, { message: 'Token is INVALID' });
    assert.equal(fakeDb.calls.length, 0);
});

test('403 for a token with sid and role that also carries a purpose', async () => {
    fakeDb.calls.length = 0;
    const t = jwt.sign({ role: 'admin', id: 7, sid: TEST_SID, purpose: 'mfa' }, process.env.JWT_SECRET);
    const r = await call(t);
    assert.equal(r.status, 403);
    assert.equal(fakeDb.calls.length, 0);
});
