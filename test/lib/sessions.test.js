const { test } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
require('../helpers/server');
const { makeFakeDb } = require('../helpers/fakeDb');
const s = require('../../src/lib/sessions');

const EIGHT_HOURS_S = 8 * 60 * 60;
const SEVEN_DAYS_S = 7 * 24 * 60 * 60;

test('createSession inserts a 64-hex id for the user and returns it', async () => {
    const db = makeFakeDb();
    const sid = await s.createSession(db, 'admin', 7);
    assert.match(sid, /^[0-9a-f]{64}$/);
    assert.match(db.calls[0].sql, /INSERT INTO auth_session/);
    assert.equal(db.calls[0].params[0], sid);
    assert.equal(db.calls[0].params[1], 'admin');
    assert.equal(db.calls[0].params[2], 7);
    assert.notEqual(await s.createSession(db, 'admin', 7), sid);
});

test('createSession expiry is 8h for admin and 7d for client', async () => {
    const db = makeFakeDb();
    await s.createSession(db, 'admin', 1);
    await s.createSession(db, 'client', 2);
    assert.equal(db.calls[0].params[3], EIGHT_HOURS_S);
    assert.equal(db.calls[1].params[3], SEVEN_DAYS_S);
});

test('issueAdminSession returns a token carrying the stored session id', async () => {
    const db = makeFakeDb();
    const token = await s.issueAdminSession(db, { id: 3, email: 'a@b.c', access_level: 2 });
    const p = jwt.verify(token, process.env.JWT_SECRET);
    assert.equal(p.sid, db.calls[0].params[0]);
    assert.equal(db.calls[0].params[1], 'admin');
    assert.equal(db.calls[0].params[2], 3);
    assert.equal(p.role, 'admin');
    assert.equal(p.exp - p.iat, EIGHT_HOURS_S);
});

test('issueClientSession returns a 7d token carrying the stored session id', async () => {
    const db = makeFakeDb();
    const token = await s.issueClientSession(db, { id: 9, username: 'u', name: 'N', company_id: 4 });
    const p = jwt.verify(token, process.env.JWT_SECRET);
    assert.equal(p.sid, db.calls[0].params[0]);
    assert.equal(db.calls[0].params[1], 'client');
    assert.equal(db.calls[0].params[2], 9);
    assert.equal(p.exp - p.iat, SEVEN_DAYS_S);
});

test('isSessionLive queries id, type, user, not revoked, not expired', async () => {
    const db = makeFakeDb([{ match: /FROM auth_session/, rows: [{ id: 'x' }] }]);
    assert.equal(await s.isSessionLive(db, 'x', 'admin', 7), true);
    const { sql, params } = db.calls[0];
    assert.match(sql, /revoked_at IS NULL/);
    assert.match(sql, /expires_at > NOW\(\)/);
    assert.deepEqual(params, ['x', 'admin', 7]);
});

test('isSessionLive is false when no row matches', async () => {
    assert.equal(await s.isSessionLive(makeFakeDb(), 'x', 'admin', 7), false);
});

test('revokeSession sets revoked_at for that id', async () => {
    const db = makeFakeDb();
    await s.revokeSession(db, 'abc');
    assert.match(db.calls[0].sql, /UPDATE auth_session SET revoked_at = NOW\(\)/);
    assert.deepEqual(db.calls[0].params, ['abc']);
});

test('revokeAllSessions revokes every live session of the user', async () => {
    const db = makeFakeDb();
    await s.revokeAllSessions(db, 'client', 5);
    assert.match(db.calls[0].sql, /UPDATE auth_session SET revoked_at = NOW\(\)/);
    assert.doesNotMatch(db.calls[0].sql, /id <> \?/);
    assert.deepEqual(db.calls[0].params, ['client', 5]);
});

test('revokeAllSessions spares exceptSid', async () => {
    const db = makeFakeDb();
    await s.revokeAllSessions(db, 'admin', 5, { exceptSid: 'keep' });
    assert.match(db.calls[0].sql, /id <> \?/);
    assert.deepEqual(db.calls[0].params, ['admin', 5, 'keep']);
});
