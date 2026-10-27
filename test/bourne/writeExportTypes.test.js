const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const { start } = require('../helpers/server');
const { makeFakeTxDb } = require('../helpers/fakeTxDb');
const { createBourneWriteRouter } = require('../../src/routes/bourne/write');
const { QuoteExportError } = require('../../src/lib/quoteExport');

const KEY = 'test-bourne-write-key';
const wait = () => new Promise((r) => setTimeout(r, 50));
let saved;
beforeEach(() => { saved = process.env.BOURNE_WRITE_KEY; process.env.BOURNE_WRITE_KEY = KEY; });
afterEach(() => {
    if (saved === undefined) delete process.env.BOURNE_WRITE_KEY;
    else process.env.BOURNE_WRITE_KEY = saved;
});

async function call(exportJob, { key = KEY, body = { type: 'quote' } } = {}) {
    const db = makeFakeTxDb([]);
    const app = express();
    app.use(express.json());
    app.use('/w', createBourneWriteRouter({ db, exportJob }));
    const s = await start(app);
    try {
        const headers = { 'Content-Type': 'application/json', ...(key ? { 'X-Bourne-Key': key } : {}) };
        const res = await fetch(`${s.baseUrl}/w/jobs/3/export`, { method: 'POST', headers, body: JSON.stringify(body) });
        const json = await res.json();
        await wait();
        return { status: res.status, json, db, logs: db.calls.filter((c) => /INSERT INTO bourne_write_log/.test(c.sql)) };
    } finally { await s.close(); }
}

function stub(impl) {
    const calls = [];
    const fn = async (...args) => { calls.push(args); return impl(); };
    fn.calls = calls;
    return fn;
}

for (const type of ['quote', 'order', 'invoice', 'packing', 'shipping']) {
    test(`export returns 200 with the fileId for ${type}`, async () => {
        const exportJob = stub(() => ({ fileId: 77 }));
        const r = await call(exportJob, { body: { type } });
        assert.strictEqual(r.status, 200);
        assert.deepStrictEqual(r.json, { fileId: 77 });
        assert.strictEqual(exportJob.calls.length, 1);
        assert.strictEqual(exportJob.calls[0][0], r.db);
        assert.strictEqual(exportJob.calls[0][1], '3');
        assert.strictEqual(exportJob.calls[0][2], type);
        assert.strictEqual(r.logs.length, 1);
    });
}

test('export without a type returns 400 and does not export', async () => {
    const exportJob = stub(() => ({}));
    const r = await call(exportJob, { body: {} });
    assert.strictEqual(r.status, 400);
    assert.deepStrictEqual(r.json, { error: 'type is required: quote, order, invoice, packing or shipping' });
    assert.strictEqual(exportJob.calls.length, 0);
});

for (const status of [409, 504]) {
    test(`export returns ${status} for a QuoteExportError`, async () => {
        const r = await call(stub(() => { throw new QuoteExportError(status, 'nope'); }));
        assert.strictEqual(r.status, status);
        assert.deepStrictEqual(r.json, { error: 'nope' });
    });
}

test('export returns 500 for an unexpected error', async () => {
    const r = await call(stub(() => { throw new Error('boom'); }));
    assert.strictEqual(r.status, 500);
    assert.deepStrictEqual(r.json, { error: 'Failed to export' });
});

test('export without a key returns 401 and does not export', async () => {
    const exportJob = stub(() => ({}));
    const r = await call(exportJob, { key: null });
    assert.strictEqual(r.status, 401);
    assert.strictEqual(exportJob.calls.length, 0);
});
