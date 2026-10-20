const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const {
    BACKUP_CODE_COUNT, hashBackupCode, replaceBackupCodes, useBackupCode,
} = require('../../src/lib/backupCodes');

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

function recordingDb(affectedRows = 1) {
    const calls = [];
    return {
        calls,
        execute: async (sql, params) => {
            calls.push({ sql, params });
            return [{ affectedRows }];
        },
    };
}

test('BACKUP_CODE_COUNT is 10', () => {
    assert.equal(BACKUP_CODE_COUNT, 10);
});

test('hashBackupCode normalizes case, spaces and dashes', () => {
    const expected = sha('abcde23456');
    assert.equal(hashBackupCode('abcde-23456'), expected);
    assert.equal(hashBackupCode('  ABCDE 23456 '), expected);
    assert.equal(hashBackupCode('AbCdE23456'), expected);
});

test('replaceBackupCodes deletes old rows then inserts 10 hashes and returns distinct display codes', async () => {
    const db = recordingDb();
    const codes = await replaceBackupCodes(db, 'admin', 7);
    assert.equal(codes.length, 10);
    assert.equal(new Set(codes).size, 10);
    for (const c of codes) assert.match(c, /^[a-z2-7]{5}-[a-z2-7]{5}$/);

    assert.equal(db.calls.length, 11);
    assert.equal(db.calls[0].sql, 'DELETE FROM auth_backup_code WHERE user_type = ? AND user_id = ?');
    assert.deepEqual(db.calls[0].params, ['admin', 7]);
    const inserted = db.calls.slice(1);
    inserted.forEach((c) => assert.match(c.sql, /^INSERT INTO auth_backup_code/));
    assert.deepEqual(
        inserted.map((c) => c.params),
        codes.map((c) => ['admin', 7, sha(c.replace('-', ''))])
    );
});

test('replaceBackupCodes never passes a plain code to db.execute', async () => {
    const db = recordingDb();
    const codes = await replaceBackupCodes(db, 'client', 3);
    const blob = JSON.stringify(db.calls);
    for (const c of codes) {
        assert.ok(!blob.includes(c));
        assert.ok(!blob.includes(c.replace('-', '')));
    }
});

test('useBackupCode runs one guarded UPDATE with the hashed normalized code', async () => {
    const db = recordingDb(1);
    assert.equal(await useBackupCode(db, 'admin', 4, ' ABCDE-23456 '), true);
    assert.equal(db.calls.length, 1);
    assert.equal(
        db.calls[0].sql,
        'UPDATE auth_backup_code SET used_at = NOW() WHERE user_type = ? AND user_id = ? AND code_hash = ? AND used_at IS NULL'
    );
    assert.deepEqual(db.calls[0].params, ['admin', 4, sha('abcde23456')]);
});

test('useBackupCode returns false when no row was updated', async () => {
    assert.equal(await useBackupCode(recordingDb(0), 'admin', 4, 'abcde-23456'), false);
});

test('bad userType throws before any query', async () => {
    const db = recordingDb();
    await assert.rejects(() => replaceBackupCodes(db, 'root', 1));
    await assert.rejects(() => useBackupCode(db, 'root', 1, 'abcde-23456'));
    assert.equal(db.calls.length, 0);
});
