const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const { start } = require('../helpers/server');
const { makeFakeDb } = require('../helpers/fakeDb');

const dbPath = require.resolve('../../src/db/db.js');
let db;
require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: {
        execute: (...a) => db.execute(...a),
        query: (...a) => db.query(...a),
    },
};

beforeEach(() => {
    db = makeFakeDb();
});

async function post(body) {
    const app = express();
    app.use(express.json());
    app.use('/job', require('../../src/routes/job'));
    const server = await start(app);
    try {
        return await fetch(`${server.baseUrl}/job/updatepo`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
    } finally {
        await server.close();
    }
}

test('updatepo without tax issues the four-column update', async () => {
    const res = await post({ jobId: 3, poNum: 'PO1', poDate: '2026-01-02', dueDate: '2026-02-03', taxCode: 0, tax: 0, taxPercent: 0 });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(db.calls[0].sql, 'UPDATE job SET po_number = ?, po_date = ?, due_date = ?, tax_code = ? WHERE id = ?');
    assert.deepStrictEqual(db.calls[0].params, ['PO1', '2026-01-02', '2026-02-03', 0, 3]);
});

test('updatepo with tax and taxPercent adds both columns', async () => {
    const res = await post({ jobId: 3, poNum: 'PO1', poDate: null, dueDate: null, taxCode: 1, tax: 4.5, taxPercent: 8 });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(db.calls[0].sql, 'UPDATE job SET po_number = ?, po_date = ?, due_date = ?, tax_code = ?, tax = ?, tax_percent = ? WHERE id = ?');
    assert.deepStrictEqual(db.calls[0].params, ['PO1', null, null, 1, 4.5, 8, 3]);
});

test('updatepo does not validate the body', async () => {
    const res = await post({ jobId: 3, poNum: 'x'.repeat(80), poDate: 'junk', dueDate: null, taxCode: 5 });
    assert.strictEqual(res.status, 200);
});
