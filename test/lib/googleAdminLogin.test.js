const test = require('node:test');
const assert = require('node:assert/strict');
const { makeFakeDb } = require('../helpers/fakeDb');
const { findGoogleAdmin } = require('../../src/lib/googleAdminLogin');

const profile = {
    id: 'g-1',
    emails: [{ value: 'a@x.com' }],
    photos: [{ value: 'pic.png' }],
};
const tokens = { accessToken: 'at', refreshToken: 'rt' };
const writes = (db) => db.calls.filter((c) => /^\s*(INSERT|UPDATE)/i.test(c.sql));

test('returns null and runs no INSERT for an unknown Google account', async () => {
    const db = makeFakeDb([]);
    const row = await findGoogleAdmin({ db, profile, ...tokens });
    assert.equal(row, null);
    assert.equal(writes(db).length, 0);
});

test('returns null without writes for a disabled admin matched by google_id', async () => {
    const db = makeFakeDb([{ match: /WHERE google_id = \?/, rows: [{ id: 1, disabled: 1 }] }]);
    const row = await findGoogleAdmin({ db, profile, ...tokens });
    assert.equal(row, null);
    assert.equal(writes(db).length, 0);
});

test('returns null without writes for a disabled admin matched by email', async () => {
    const db = makeFakeDb([{ match: /SELECT \* FROM admin WHERE email = \?/, rows: [{ id: 1, disabled: 1 }] }]);
    const row = await findGoogleAdmin({ db, profile, ...tokens });
    assert.equal(row, null);
    assert.equal(writes(db).length, 0);
});

test('updates tokens and picture for an enabled admin matched by google_id', async () => {
    const admin = { id: 1, disabled: 0, email: 'a@x.com' };
    const db = makeFakeDb([{ match: /SELECT \* FROM admin WHERE google_id = \?/, rows: [admin] }]);
    const row = await findGoogleAdmin({ db, profile, ...tokens });
    assert.equal(row, admin);
    const w = writes(db);
    assert.equal(w.length, 1);
    assert.match(w[0].sql, /^UPDATE admin SET profile_picture = \?, google_access_token = \?, google_refresh_token = \? WHERE google_id = \?/);
    assert.deepEqual(w[0].params, ['pic.png', 'at', 'rt', 'g-1']);
});

test('links google_id for an enabled admin matched by email', async () => {
    const admin = { id: 2, disabled: 0, email: 'a@x.com' };
    const db = makeFakeDb([{ match: /SELECT \* FROM admin WHERE email = \?/, rows: [admin] }]);
    const row = await findGoogleAdmin({ db, profile, ...tokens });
    assert.equal(row, admin);
    const w = writes(db);
    assert.equal(w.length, 1);
    assert.match(w[0].sql, /^UPDATE admin SET google_id = \?.* WHERE email = \?/);
    assert.deepEqual(w[0].params, ['g-1', 'pic.png', 'at', 'rt', 'a@x.com']);
});
