const { test } = require('node:test');
const assert = require('node:assert');
const { makeFakeDb } = require('../helpers/fakeDb');
const { LOCK_AFTER, LOCK_MINUTES, isLocked, recordFailure, clearFailures } = require('../../src/lib/lockout');

const NOW = new Date('2026-01-01T12:00:00Z');

test('isLocked is true only while locked_until is in the future', () => {
    assert.strictEqual(isLocked({ locked_until: null }, NOW), false);
    assert.strictEqual(isLocked({}, NOW), false);
    assert.strictEqual(isLocked({ locked_until: new Date('2026-01-01T11:59:59Z') }, NOW), false);
    assert.strictEqual(isLocked({ locked_until: new Date('2026-01-01T12:00:01Z') }, NOW), true);
});

test('constants are five failures and fifteen minutes', () => {
    assert.deepStrictEqual([LOCK_AFTER, LOCK_MINUTES], [5, 15]);
});

function makeLockDb({ count, lockAffected = 1 }) {
    const calls = [];
    return {
        calls,
        execute: async (sql, params) => {
            calls.push({ sql, params });
            if (/^SELECT failed_logins/.test(sql)) return [[{ failed_logins: count }]];
            if (/failed_logins = 0, locked_until = \?/.test(sql)) return [{ affectedRows: lockAffected }];
            return [{ affectedRows: 1 }];
        },
    };
}

test('a failure below the limit increments in SQL, reads the count back and sends nothing', async () => {
    const db = makeLockDb({ count: 4 });
    const sent = [];
    await recordFailure({ db, table: 'admin', row: { id: 3, failed_logins: 0, email: 'a@x.com' }, now: NOW, send: async (m) => sent.push(m) });
    assert.strictEqual(db.calls.length, 2);
    assert.match(db.calls[0].sql, /^UPDATE admin SET failed_logins = failed_logins \+ 1 WHERE id = \?/);
    assert.deepStrictEqual(db.calls[0].params, [3]);
    assert.match(db.calls[1].sql, /^SELECT failed_logins FROM admin WHERE id = \?/);
    assert.deepStrictEqual(db.calls[1].params, [3]);
    assert.deepStrictEqual(sent, []);
});

test('reaching 5 locks for 15 minutes, resets the count and emails the owner', async () => {
    const db = makeLockDb({ count: 5 });
    const sent = [];
    await recordFailure({ db, table: 'clients', row: { id: 9, failed_logins: 0, email: 'c@x.com', name: 'Cee' }, now: NOW, send: async (m) => sent.push(m) });
    assert.strictEqual(db.calls.length, 3);
    assert.match(db.calls[2].sql, /^UPDATE clients SET failed_logins = 0, locked_until = \? WHERE id = \? AND failed_logins >= \?/);
    assert.deepStrictEqual(db.calls[2].params, [new Date('2026-01-01T12:15:00Z'), 9, 5]);
    assert.strictEqual(sent.length, 1);
    assert.strictEqual(sent[0].to, 'c@x.com');
    assert.match(sent[0].text, /Hi Cee/);
    assert.match(sent[0].text, /15 minutes/);
});

test('a count above 5 still locks', async () => {
    const db = makeLockDb({ count: 7 });
    const sent = [];
    await recordFailure({ db, table: 'admin', row: { id: 1, email: 'a@x.com' }, now: NOW, send: async (m) => sent.push(m) });
    assert.strictEqual(db.calls.length, 3);
    assert.strictEqual(sent.length, 1);
});

test('no email is sent when a concurrent failure already took the lock (0 rows affected)', async () => {
    const db = makeLockDb({ count: 5, lockAffected: 0 });
    const sent = [];
    await recordFailure({ db, table: 'admin', row: { id: 1, email: 'a@x.com' }, now: NOW, send: async (m) => sent.push(m) });
    assert.strictEqual(db.calls.length, 3);
    assert.deepStrictEqual(sent, []);
});

test('the lock email is skipped without an address and a send error is logged, not thrown', async () => {
    const db = makeLockDb({ count: 5 });
    const sent = [];
    await recordFailure({ db, table: 'clients', row: { id: 1, email: null }, now: NOW, send: async (m) => sent.push(m) });
    assert.deepStrictEqual(sent, []);

    const logged = [];
    const orig = console.error;
    console.error = (...a) => logged.push(a);
    try {
        await recordFailure({ db, table: 'admin', row: { id: 1, email: 'a@x.com' }, now: NOW, send: async () => { throw new Error('ses down'); } });
    } finally {
        console.error = orig;
    }
    assert.strictEqual(logged.length, 1);
});

test('clearFailures zeroes the count and the lock', async () => {
    const db = makeFakeDb();
    await clearFailures({ db, table: 'admin', row: { id: 3, failed_logins: 2 } });
    assert.match(db.calls[0].sql, /^UPDATE admin SET failed_logins = 0, locked_until = NULL WHERE id = \?/);
    assert.deepStrictEqual(db.calls[0].params, [3]);
});

test('clearFailures skips the write when nothing is recorded', async () => {
    const db = makeFakeDb();
    await clearFailures({ db, table: 'admin', row: { id: 3, failed_logins: 0, locked_until: null } });
    assert.strictEqual(db.calls.length, 0);
});

test('recordFailure and clearFailures reject any other table', async () => {
    const db = makeFakeDb();
    const row = { id: 1, failed_logins: 0 };
    await assert.rejects(recordFailure({ db, table: 'users', row, now: NOW, send: async () => {} }));
    await assert.rejects(clearFailures({ db, table: 'admin; DROP', row }));
    assert.strictEqual(db.calls.length, 0);
});
