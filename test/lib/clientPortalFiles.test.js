const { test } = require('node:test');
const assert = require('node:assert');
const { makeFakeDb } = require('../helpers/fakeDb');
const { ownsFile } = require('../../src/lib/clientPortal');

test('ownsFile checks job ownership when job_id is set and part ownership when it is not, binding companyId for each', async () => {
    const db = makeFakeDb([{ match: /uploaded_files/, rows: [{ id: 7 }] }]);
    assert.strictEqual(await ownsFile(db, 5, 7), true);
    assert.strictEqual(db.calls.length, 1);
    const { sql, params } = db.calls[0];
    assert.match(sql, /job_id IS NOT NULL/);
    assert.match(sql, /job_id IS NULL/);
    assert.deepStrictEqual(params, [7, 5, 5]);
});

test('ownsFile is false when no row matches', async () => {
    const db = makeFakeDb([]);
    assert.strictEqual(await ownsFile(db, 5, 7), false);
});
