const { test } = require('node:test');
const assert = require('node:assert');
const { makeFakeTxDb } = require('../helpers/fakeTxDb');
const { JobPartError, addPartToJob, updateJobPart, removeJobPart } = require('../../src/lib/jobParts');

const sqlCalls = (db, re) => db.calls.filter((c) => c.sql && re.test(c.sql));
const txLog = (db) => db.calls.filter((c) => c.tx).map((c) => c.tx);
const rejectsWith = (promise, status, message) =>
    assert.rejects(promise, (e) => e instanceof JobPartError && e.status === status && (!message || e.message === message));

const insertJobPart = { match: /INSERT INTO job_part/, rows: { insertId: 55 } };

test('addPartToJob links an existing part by part_id with price 1 by default', async () => {
    const db = makeFakeTxDb([{ match: /SELECT id FROM part WHERE id/, rows: [{ id: 9 }] }, insertJobPart]);
    const result = await addPartToJob(db, 7, { part_id: 9, quantity: 2 });

    assert.deepStrictEqual(result, { job_part_id: 55, part_id: 9 });
    assert.deepStrictEqual(sqlCalls(db, /INSERT INTO job_part/)[0].params, [7, 9, 2, 1, null, null, null, null, '']);
});

test('addPartToJob 404s for an unknown part_id and inserts nothing', async () => {
    const db = makeFakeTxDb([insertJobPart]);
    await rejectsWith(addPartToJob(db, 7, { part_id: 9, quantity: 2 }), 404);
    assert.strictEqual(sqlCalls(db, /INSERT INTO job_part/).length, 0);
});

test('addPartToJob creates a new part_number and stores details, price and fields', async () => {
    const db = makeFakeTxDb([
        { match: /INSERT IGNORE INTO part/, rows: { insertId: 12, affectedRows: 1 } },
        insertJobPart,
    ]);
    const result = await addPartToJob(db, 7, {
        part_number: 'A-1', description: 'Bracket', quantity: 3, price: '4.5',
        rev: 'B', material: '6061', finish: 'anodize', stock_size: '1x2',
    });

    assert.deepStrictEqual(result, { job_part_id: 55, part_id: 12 });
    assert.deepStrictEqual(sqlCalls(db, /INSERT IGNORE INTO part/)[0].params, ['A-1', 'Bracket']);
    assert.deepStrictEqual(sqlCalls(db, /INSERT INTO job_part/)[0].params, [7, 12, 3, 4.5, 'B', '6061', 'anodize', '1x2', '*6061 *anodize']);
});

test('addPartToJob reuses an existing part_number via SELECT id', async () => {
    const db = makeFakeTxDb([
        { match: /INSERT IGNORE INTO part/, rows: { insertId: 0, affectedRows: 0 } },
        { match: /SELECT id FROM part WHERE number/, rows: [{ id: 4 }] },
        insertJobPart,
    ]);
    const result = await addPartToJob(db, 7, { part_number: 'A-1', quantity: 1 });
    assert.strictEqual(result.part_id, 4);
    assert.deepStrictEqual(sqlCalls(db, /SELECT id FROM part WHERE number/)[0].params, ['A-1']);
});

test('addPartToJob maps validation failures to 400 JobPartError', async () => {
    const db = makeFakeTxDb([]);
    await rejectsWith(addPartToJob(db, 7, { part_id: 9, quantity: 0 }), 400);
    await rejectsWith(addPartToJob(db, 7, { part_number: 'A', quantity: 1, price: -1 }), 400);
    await rejectsWith(addPartToJob(db, 7, { quantity: 1 }), 400);
    assert.strictEqual(db.calls.length, 0);
});

const owned = { match: /SELECT id FROM job_part WHERE id = \? AND job_id/, rows: [{ id: 5 }] };

test('updateJobPart sets only the sent fields', async () => {
    const db = makeFakeTxDb([owned]);
    await updateJobPart(db, 7, 5, { quantity: '4', price: '2.345', note: 'hi', finish: ' zinc ' });

    const update = sqlCalls(db, /UPDATE job_part/)[0];
    assert.strictEqual(update.sql, 'UPDATE job_part SET quantity = ?, price = ?, note = ?, finish = ? WHERE id = ? AND job_id = ?');
    assert.deepStrictEqual(update.params, [4, 2.35, 'hi', 'zinc', 5, 7]);
});

test('updateJobPart ignores unknown fields and 400s when nothing is sent', async () => {
    const db = makeFakeTxDb([owned]);
    await rejectsWith(updateJobPart(db, 7, 5, { job_id: 8, bogus: 1 }), 400);
    assert.strictEqual(sqlCalls(db, /UPDATE/).length, 0);
});

test('updateJobPart 400s on a bad quantity or price', async () => {
    const db = makeFakeTxDb([owned]);
    await rejectsWith(updateJobPart(db, 7, 5, { quantity: 0 }), 400);
    await rejectsWith(updateJobPart(db, 7, 5, { quantity: 1.5 }), 400);
    await rejectsWith(updateJobPart(db, 7, 5, { price: -2 }), 400);
    assert.strictEqual(sqlCalls(db, /UPDATE/).length, 0);
});

test('updateJobPart 404s when the job_part is not on the job', async () => {
    const db = makeFakeTxDb([]);
    await rejectsWith(updateJobPart(db, 7, 5, { quantity: 2 }), 404);
    assert.deepStrictEqual(sqlCalls(db, /SELECT id FROM job_part/)[0].params, [5, 7]);
    assert.strictEqual(sqlCalls(db, /UPDATE/).length, 0);
});

const jobPartRow = { match: /FROM job_part jp JOIN job j/, rows: [{ invoice_number: null }] };

test('removeJobPart deletes stars then job_part in one transaction and never the part', async () => {
    const db = makeFakeTxDb([jobPartRow]);
    await removeJobPart(db, 7, 5);

    const deletes = db.calls.filter((c) => c.sql && /DELETE/.test(c.sql));
    assert.deepStrictEqual(deletes.map((c) => c.sql), [
        'DELETE FROM stars WHERE job_part_id = ?',
        'DELETE FROM job_part WHERE id = ? AND job_id = ?',
    ]);
    assert.deepStrictEqual(deletes[1].params, [5, 7]);
    assert.deepStrictEqual(txLog(db), ['beginTransaction', 'commit', 'release']);
    assert.strictEqual(sqlCalls(db, /part_file|DELETE FROM part\b/).length, 0);
});

test('removeJobPart 404s when missing', async () => {
    const db = makeFakeTxDb([]);
    await rejectsWith(removeJobPart(db, 7, 5), 404);
    assert.strictEqual(sqlCalls(db, /DELETE/).length, 0);
});

test('removeJobPart 409s when the job is invoiced', async () => {
    const db = makeFakeTxDb([{ match: /FROM job_part jp JOIN job j/, rows: [{ invoice_number: 'INV-1' }] }]);
    await rejectsWith(removeJobPart(db, 7, 5), 409, 'Job is invoiced');
    assert.strictEqual(sqlCalls(db, /DELETE/).length, 0);
});

test('removeJobPart rolls back and releases when a delete fails', async () => {
    const boom = new Error('boom');
    const db = makeFakeTxDb([jobPartRow, { match: /DELETE FROM job_part/, error: boom }]);
    await assert.rejects(removeJobPart(db, 7, 5), boom);
    assert.deepStrictEqual(txLog(db), ['beginTransaction', 'rollback', 'release']);
});
