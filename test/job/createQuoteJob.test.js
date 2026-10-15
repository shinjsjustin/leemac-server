const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const { start } = require('../helpers/server');
const { makeFakeTxDb } = require('../helpers/fakeTxDb');

const dbPath = require.resolve('../../src/db/db.js');
let db;
require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: {
        execute: (...a) => db.execute(...a),
        query: (...a) => db.query(...a),
        getConnection: (...a) => db.getConnection(...a),
    },
};

beforeEach(() => {
    db = makeFakeTxDb([
        { match: /SELECT metavalue FROM metadata/, rows: [{ metavalue: '"41"' }] },
        { match: /INSERT INTO job \(/, rows: { insertId: 7 } },
        { match: /INSERT IGNORE INTO part/, rows: { insertId: 9, affectedRows: 1 } },
        { match: /INSERT INTO job_part/, rows: { insertId: 55 } },
    ]);
});

async function post(body) {
    const app = express();
    app.use(express.json());
    app.use('/job', require('../../src/routes/job'));
    const server = await start(app);
    try {
        const res = await fetch(`${server.baseUrl}/job/createquotejob`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        return { status: res.status, json: await res.json() };
    } finally {
        await server.close();
    }
}

test('createquotejob returns 201 with id, job_number and job_part_ids', async () => {
    const res = await post({ company_id: 5, parts: [{ part_number: 'A-1', quantity: 2 }] });
    assert.strictEqual(res.status, 201);
    assert.deepStrictEqual(res.json, { id: 7, job_number: '42', job_part_ids: [55] });
});

test('createquotejob returns 400 for invalid input without opening a transaction', async () => {
    const res = await post({ company_id: 5, parts: [] });
    assert.strictEqual(res.status, 400);
    assert.ok(res.json.error);
    assert.strictEqual(db.calls.length, 0);
});

test('createquotejob returns 500 when the transaction fails', async () => {
    db = makeFakeTxDb([{ match: /SELECT metavalue/, error: new Error('down') }]);
    const res = await post({ company_id: 5, parts: [{ part_number: 'A-1', quantity: 2 }] });
    assert.strictEqual(res.status, 500);
    assert.ok(res.json.error);
});
