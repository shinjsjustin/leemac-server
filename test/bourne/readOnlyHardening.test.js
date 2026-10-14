const { test } = require('node:test');
const assert = require('node:assert');
const { readOnly } = require('../../src/lib/bourne/readOnlyDb');
const { makeFakeDb } = require('../helpers/fakeDb');

test('rejects SELECT with write or locking clauses without calling db', async () => {
    const db = makeFakeDb();
    const ro = readOnly(db);
    const bad = [
        "SELECT * FROM job INTO OUTFILE '/tmp/x'",
        "select * from job into outfile '/tmp/x'",
        "SELECT * FROM job INTO DUMPFILE '/tmp/x'",
        'SELECT id FROM job INTO @v',
        'SELECT id FROM job INTO   @v',
        'SELECT * FROM job WHERE id = 1 FOR UPDATE',
        'SELECT * FROM job for\nshare',
        'SELECT * FROM job FOR SHARE',
        'SELECT * FROM job LOCK IN SHARE MODE',
        'SELECT * FROM job lock  in share mode',
        'SELECT * FROM (SELECT * FROM job FOR UPDATE) t',
    ];
    for (const sql of bad) {
        await assert.rejects(ro.execute(sql), undefined, sql);
        await assert.rejects(ro.query(sql), undefined, sql);
    }
    assert.strictEqual(db.calls.length, 0);
});

test('still allows SELECTs that merely contain similar words', async () => {
    const db = makeFakeDb();
    const ro = readOnly(db);
    await ro.execute('SELECT for_update, outfile_name, into_x FROM job WHERE note = ?', ['x']);
    assert.strictEqual(db.calls.length, 1);
});
