const { test } = require('node:test');
const assert = require('node:assert');
const { readOnly } = require('../../src/lib/bourne/readOnlyDb');
const { makeFakeDb } = require('../helpers/fakeDb');

test('delegates a SELECT to the wrapped db for execute and query', async () => {
    const db = makeFakeDb([{ match: /select/i, rows: [{ id: 1 }] }]);
    const ro = readOnly(db);
    assert.deepStrictEqual(await ro.execute('SELECT * FROM job WHERE id = ?', [1]), [[{ id: 1 }]]);
    await ro.query('  select 1');
    assert.strictEqual(db.calls.length, 2);
    assert.deepStrictEqual(db.calls[0].params, [1]);
});

test('allows leading comments before SELECT', async () => {
    const db = makeFakeDb();
    const ro = readOnly(db);
    await ro.query('-- hi\n/* x */ SELECT 1');
    assert.strictEqual(db.calls.length, 1);
});

test('rejects non-SELECT or multi-statement SQL without calling db', async () => {
    const db = makeFakeDb();
    const ro = readOnly(db);
    const bad = [
        'INSERT INTO job VALUES (1)', 'UPDATE job SET a=1', 'DELETE FROM job',
        'DROP TABLE job', '', 'SELECT 1; DROP TABLE job', 'SELECT 1;',
        '/* SELECT */ DELETE FROM job', 'WITH x AS (SELECT 1) DELETE FROM job',
    ];
    for (const sql of bad) {
        await assert.rejects(ro.execute(sql), undefined, sql);
        await assert.rejects(ro.query(sql), undefined, sql);
    }
    assert.strictEqual(db.calls.length, 0);
});
