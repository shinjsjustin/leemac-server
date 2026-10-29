const { test } = require('node:test');
const assert = require('node:assert');
const { makeFakeTxDb } = require('../helpers/fakeTxDb');
const { insertQuoteJob, QuoteJobError } = require('../../src/lib/quoteJob');

function makeConn() {
    let partId = 10;
    let jobPartId = 100;
    const db = makeFakeTxDb([
        { match: /SELECT metavalue FROM metadata/, rows: [{ metavalue: '"41"' }] },
        { match: /INSERT INTO job \(/, rows: { insertId: 7 } },
        { match: /INSERT IGNORE INTO part/, rows: () => ({ insertId: (partId += 1), affectedRows: 1 }) },
        { match: /INSERT INTO job_part/, rows: () => ({ insertId: (jobPartId += 1) }) },
    ]);
    return db.getConnection().then((conn) => ({ db, conn }));
}

const part = (n) => ({ part_number: n, quantity: 1 });

test('insertQuoteJob returns job id, number, job_part_ids and part_ids in part order', async () => {
    const { conn } = await makeConn();
    const result = await insertQuoteJob(conn, { company_id: 5, attention: 'Bob', parts: [part('A'), part('B')] });
    assert.deepStrictEqual(result, { id: 7, job_number: '42', job_part_ids: [101, 102], part_ids: [11, 12] });
});

test('insertQuoteJob does not open, commit or roll back a transaction itself', async () => {
    const { db, conn } = await makeConn();
    await insertQuoteJob(conn, { company_id: 5, parts: [part('A')] });
    assert.deepStrictEqual(db.calls.filter((c) => c.tx), []);
});

test('insertQuoteJob rejects a body without parts with a 400', async () => {
    const { conn } = await makeConn();
    await assert.rejects(insertQuoteJob(conn, { company_id: 5, parts: [] }), (e) => e instanceof QuoteJobError && e.status === 400);
});
