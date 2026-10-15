const { test } = require('node:test');
const assert = require('node:assert');
const { makeFakeTxDb } = require('../helpers/fakeTxDb');
const { createQuoteJob, QuoteJobError } = require('../../src/lib/quoteJob');

function makeDb(extra = []) {
    let jobPartId = 100;
    return makeFakeTxDb([
        { match: /SELECT metavalue FROM metadata/, rows: [{ metavalue: '"41"' }] },
        { match: /INSERT INTO job \(/, rows: { insertId: 7 } },
        { match: /INSERT IGNORE INTO part/, rows: { insertId: 9, affectedRows: 1 } },
        { match: /INSERT INTO job_part/, rows: () => ({ insertId: (jobPartId += 1) }) },
        ...extra,
    ]);
}

const PART = {
    part_number: 'A-1',
    rev: 'B',
    material: '6061',
    finish: 'anodize',
    stock_size: '1x2',
    quantity: 3,
};

const sqlCalls = (db, re) => db.calls.filter((c) => c.sql && re.test(c.sql));
const txLog = (db) => db.calls.filter((c) => c.tx).map((c) => c.tx);

test('createQuoteJob uses counter plus one as job_number and stores it, inside a transaction', async () => {
    const db = makeDb();
    const result = await createQuoteJob(db, { company_id: 5, attention: 'Bob', parts: [PART] });

    assert.deepStrictEqual(result, { id: 7, job_number: '42', job_part_ids: [101] });
    assert.deepStrictEqual(sqlCalls(db, /INSERT INTO job \(/)[0].params, ['42', 5, 'Bob']);
    assert.deepStrictEqual(sqlCalls(db, /REPLACE INTO metadata/)[0].params, ['42']);
    assert.deepStrictEqual(txLog(db), ['beginTransaction', 'commit', 'release']);
    assert.strictEqual(db.calls[0].tx, 'beginTransaction');
});

test('createQuoteJob inserts rev, material, finish, stock_size, quantity, details and price', async () => {
    const db = makeDb();
    await createQuoteJob(db, { company_id: 5, parts: [PART, { ...PART, part_number: 'A-2', price: '12.5' }] });

    const inserts = sqlCalls(db, /INSERT INTO job_part/);
    assert.match(inserts[0].sql, /\(job_id, part_id, quantity, price, rev, material, finish, stock_size, details\)/);
    assert.deepStrictEqual(inserts[0].params, [7, 9, 3, 1, 'B', '6061', 'anodize', '1x2', '*6061 *anodize']);
    assert.strictEqual(inserts[1].params[3], 12.5);
});

test('createQuoteJob rolls back and releases when an insert fails, with no commit', async () => {
    const boom = new Error('boom');
    const failing = makeFakeTxDb([
        { match: /SELECT metavalue FROM metadata/, rows: [{ metavalue: '"41"' }] },
        { match: /INSERT INTO job \(/, rows: { insertId: 7 } },
        { match: /INSERT IGNORE INTO part/, rows: { insertId: 9, affectedRows: 1 } },
        { match: /INSERT INTO job_part/, error: boom },
    ]);
    await assert.rejects(createQuoteJob(failing, { company_id: 5, parts: [PART] }), boom);
    assert.deepStrictEqual(txLog(failing), ['beginTransaction', 'rollback', 'release']);
});

test('createQuoteJob rejects invalid input with a 400 before any transaction', async () => {
    const bad = [
        { parts: [PART] },
        { company_id: 5, parts: [] },
        { company_id: 5, parts: [{ ...PART, part_number: '  ' }] },
        { company_id: 5, parts: [{ ...PART, quantity: 0 }] },
        { company_id: 5, parts: [{ ...PART, price: 'abc' }] },
        { company_id: 5, parts: [{ ...PART, price: -2 }] },
    ];
    for (const body of bad) {
        const db = makeDb();
        await assert.rejects(createQuoteJob(db, body), (e) => e instanceof QuoteJobError && e.status === 400);
        assert.strictEqual(db.calls.length, 0);
    }
});
