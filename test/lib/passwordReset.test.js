const { test } = require('node:test');
const assert = require('node:assert');
const { requestReset, completeReset } = require('../../src/lib/passwordReset');
const { hashToken } = require('../../src/lib/authTokens');
const { verifyPassword } = require('../../src/lib/auth');

function makeDb({ user, tokenRow, disabledRow } = {}) {
    const calls = [];
    return {
        calls,
        execute: async (sql, params) => {
            calls.push({ sql, params });
            if (/^SELECT disabled FROM admin WHERE id = \?/.test(sql)) return [disabledRow ? [disabledRow] : []];
            if (/^SELECT \* FROM (admin|clients) WHERE email/.test(sql)) return [user ? [user] : []];
            if (/UPDATE auth_token SET used_at/.test(sql)) return [{ affectedRows: tokenRow ? 1 : 0 }];
            if (/SELECT \* FROM auth_token/.test(sql)) return [[tokenRow]];
            return [{ affectedRows: 1 }];
        },
    };
}

test('requestReset emails a link holding the raw token and stores only its hash', async () => {
    const db = makeDb({ user: { id: 4, name: 'Ann', email: 'a@x.com', disabled: 0 } });
    const sent = [];
    await requestReset({ db, userType: 'admin', email: '  A@X.com ', send: async (m) => sent.push(m) });
    assert.deepStrictEqual(db.calls[0].params, ['a@x.com']);
    assert.match(db.calls[0].sql, /FROM admin WHERE email/);
    assert.strictEqual(sent.length, 1);
    assert.strictEqual(sent[0].to, 'a@x.com');
    const raw = sent[0].text.match(/token=([0-9a-f]{64})/)[1];
    assert.match(sent[0].text, /\/reset-password\?type=admin&token=/);
    const insert = db.calls.find((c) => /INSERT INTO auth_token/.test(c.sql));
    assert.strictEqual(insert.params[0], 'reset');
    assert.strictEqual(insert.params[1], 'admin');
    assert.strictEqual(insert.params[2], 4);
    assert.ok(insert.params.includes(hashToken(raw)));
    assert.ok(!insert.params.includes(raw));
});

test('requestReset reads the clients table for client resets', async () => {
    const db = makeDb({ user: { id: 9, name: 'Co', email: 'c@x.com' } });
    const sent = [];
    await requestReset({ db, userType: 'client', email: 'c@x.com', send: async (m) => sent.push(m) });
    assert.match(db.calls[0].sql, /FROM clients WHERE email/);
    assert.match(sent[0].text, /type=client/);
});

test('requestReset sends nothing for unknown or disabled users', async () => {
    for (const user of [undefined, { id: 4, name: 'A', email: 'a@x.com', disabled: 1 }]) {
        const db = makeDb({ user });
        const sent = [];
        await requestReset({ db, userType: 'admin', email: 'a@x.com', send: async (m) => sent.push(m) });
        assert.strictEqual(sent.length, 0);
        assert.ok(!db.calls.some((c) => /INSERT INTO auth_token/.test(c.sql)));
    }
});

test('requestReset rejects unknown user types and swallows send errors', async () => {
    await assert.rejects(requestReset({ db: makeDb(), userType: 'root', email: 'a@x.com', send: async () => {} }));
    const db = makeDb({ user: { id: 4, name: 'A', email: 'a@x.com' } });
    const original = console.error;
    console.error = () => {};
    try {
        await requestReset({ db, userType: 'admin', email: 'a@x.com', send: async () => { throw new Error('smtp'); } });
    } finally {
        console.error = original;
    }
});

test('completeReset returns false and changes nothing for an invalid token', async () => {
    const db = makeDb();
    assert.strictEqual(await completeReset({ db, userType: 'admin', token: 'bad', newPassword: 'pw' }), false);
    assert.ok(!db.calls.some((c) => /UPDATE (admin|clients) SET/.test(c.sql)));
});

test('completeReset sets a bcrypt password, clears lock, verifies email and revokes all sessions', async () => {
    const db = makeDb({ tokenRow: { user_id: 4, user_type: 'client' } });
    assert.strictEqual(await completeReset({ db, userType: 'client', token: 't', newPassword: 'newpw' }), true);
    const consume = db.calls[0];
    assert.deepStrictEqual(consume.params, [hashToken('t'), 'reset', 'client']);
    const update = db.calls.find((c) => /UPDATE clients SET/.test(c.sql));
    assert.match(update.sql, /failed_logins = 0/);
    assert.match(update.sql, /locked_until = NULL/);
    assert.match(update.sql, /email_verified_at = COALESCE\(email_verified_at, NOW\(\)\)/);
    assert.strictEqual(update.params[1], 4);
    assert.ok(await verifyPassword('newpw', update.params[0]));
    const revoke = db.calls.find((c) => /UPDATE auth_session SET revoked_at/.test(c.sql));
    assert.deepStrictEqual(revoke.params, ['client', 4]);
});

test('completeReset returns false and changes nothing for a disabled or missing admin', async () => {
    for (const disabledRow of [{ disabled: 1 }, undefined]) {
        const db = makeDb({ tokenRow: { user_id: 4, user_type: 'admin' }, disabledRow });
        assert.strictEqual(await completeReset({ db, userType: 'admin', token: 't', newPassword: 'pw' }), false);
        const check = db.calls.find((c) => /SELECT disabled FROM admin WHERE id = \?/.test(c.sql));
        assert.deepStrictEqual(check.params, [4]);
        assert.ok(!db.calls.some((c) => /UPDATE admin SET/.test(c.sql)));
        assert.ok(!db.calls.some((c) => /UPDATE auth_session/.test(c.sql)));
    }
});

test('completeReset resets an enabled admin', async () => {
    const db = makeDb({ tokenRow: { user_id: 4, user_type: 'admin' }, disabledRow: { disabled: 0 } });
    assert.strictEqual(await completeReset({ db, userType: 'admin', token: 't', newPassword: 'pw' }), true);
    assert.ok(db.calls.some((c) => /UPDATE admin SET password/.test(c.sql)));
});

test('completeReset runs no disabled check for clients', async () => {
    const db = makeDb({ tokenRow: { user_id: 4, user_type: 'client' } });
    await completeReset({ db, userType: 'client', token: 't', newPassword: 'pw' });
    assert.ok(!db.calls.some((c) => /SELECT disabled/.test(c.sql)));
});

test('completeReset rejects unknown user types', async () => {
    await assert.rejects(completeReset({ db: makeDb(), userType: 'root', token: 't', newPassword: 'p' }));
});
