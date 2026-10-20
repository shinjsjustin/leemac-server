const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const { TOKEN_HOURS, hashToken, createAuthToken, consumeAuthToken, findAuthToken } = require('../../src/lib/authTokens');

function fakeDb({ affectedRows = 1, row = { id: 7 } } = {}) {
    const calls = [];
    return {
        calls,
        async execute(sql, params) {
            calls.push({ sql, params });
            if (/^\s*UPDATE/i.test(sql)) return [{ affectedRows }];
            return [[row]];
        },
    };
}

test('hashToken returns SHA-256 hex', () => {
    assert.strictEqual(
        hashToken('abc'),
        'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );
    assert.strictEqual(TOKEN_HOURS, 24);
});

test('createAuthToken returns a 64-hex raw token and stores only its hash', async () => {
    const db = fakeDb();
    const raw = await createAuthToken(db, {
        purpose: 'invite', userType: 'client', email: 'a@b.co', name: 'Ann', companyId: 3, createdBy: 9,
    });
    assert.match(raw, /^[0-9a-f]{64}$/);
    assert.strictEqual(db.calls.length, 1);
    const { sql, params } = db.calls[0];
    assert.match(sql, /INSERT INTO auth_token/);
    assert.match(sql, /DATE_ADD\(NOW\(\), INTERVAL \? HOUR\)/);
    assert.deepStrictEqual(params, [
        'invite', 'client', null, 'a@b.co', 'Ann', 3, crypto.createHash('sha256').update(raw).digest('hex'), 9, 24,
    ]);
    assert.ok(!params.includes(raw));
});

test('createAuthToken makes a different token each call', async () => {
    const db = fakeDb();
    const a = await createAuthToken(db, { purpose: 'reset', userType: 'admin', userId: 1, email: 'x@y.z' });
    const b = await createAuthToken(db, { purpose: 'reset', userType: 'admin', userId: 1, email: 'x@y.z' });
    assert.notStrictEqual(a, b);
});

test('consumeAuthToken issues one filtered UPDATE then returns the row', async () => {
    const db = fakeDb({ row: { id: 5, email: 'a@b.co' } });
    const row = await consumeAuthToken(db, { purpose: 'reset', userType: 'client', token: 'tok' });
    assert.deepStrictEqual(row, { id: 5, email: 'a@b.co' });
    const { sql, params } = db.calls[0];
    for (const part of ['token_hash = ?', 'purpose = ?', 'user_type = ?', 'used_at IS NULL', 'expires_at > NOW()']) {
        assert.ok(sql.includes(part), part);
    }
    assert.deepStrictEqual(params, [hashToken('tok'), 'reset', 'client']);
    assert.match(db.calls[1].sql, /SELECT .* WHERE token_hash = \?/);
    assert.deepStrictEqual(db.calls[1].params, [hashToken('tok')]);
});

test('consumeAuthToken returns null when no row was updated', async () => {
    const db = fakeDb({ affectedRows: 0 });
    const row = await consumeAuthToken(db, { purpose: 'reset', userType: 'client', token: 'tok' });
    assert.strictEqual(row, null);
    assert.strictEqual(db.calls.length, 1);
});

test('consumeAuthToken rejects unknown purposes', async () => {
    await assert.rejects(
        consumeAuthToken(fakeDb(), { purpose: 'login', userType: 'client', token: 't' }),
        /purpose/i
    );
});

test('findAuthToken runs one filtered SELECT, returns the row and never updates', async () => {
    const db = fakeDb({ row: { id: 5, email: 'a@b.co' } });
    const row = await findAuthToken(db, { purpose: 'invite', userType: 'client', token: 'tok' });
    assert.deepStrictEqual(row, { id: 5, email: 'a@b.co' });
    assert.strictEqual(db.calls.length, 1);
    const { sql, params } = db.calls[0];
    assert.match(sql, /^\s*SELECT \* FROM auth_token/);
    for (const part of ['token_hash = ?', 'purpose = ?', 'user_type = ?', 'used_at IS NULL', 'expires_at > NOW()']) {
        assert.ok(sql.includes(part), part);
    }
    assert.deepStrictEqual(params, [hashToken('tok'), 'invite', 'client']);
});

test('findAuthToken returns null when no row matches', async () => {
    const db = { async execute() { return [[]]; } };
    assert.strictEqual(await findAuthToken(db, { purpose: 'invite', userType: 'client', token: 't' }), null);
});

test('findAuthToken rejects unknown purposes', async () => {
    await assert.rejects(
        findAuthToken(fakeDb(), { purpose: 'login', userType: 'client', token: 't' }),
        /purpose/i
    );
});
