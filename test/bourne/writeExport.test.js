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

async function call(exportQuote, { key = KEY } = {}) {
    const db = makeFakeTxDb([]);
    const app = express();
    app.use(express.json());
    app.use('/w', createBourneWriteRouter({ db, exportQuote }));
    const s = await start(app);
    try {
        const headers = key ? { 'X-Bourne-Key': key } : {};
        const res = await fetch(`${s.baseUrl}/w/jobs/3/export-quote`, { method: 'POST', headers });
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

test('export-quote returns 200 with the exportQuote result', async () => {
    const exportQuote = stub(() => ({ url: 'https://doc/1' }));
    const r = await call(exportQuote);
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(r.json, { url: 'https://doc/1' });
    assert.strictEqual(exportQuote.calls.length, 1);
    assert.strictEqual(exportQuote.calls[0][0], r.db);
    assert.strictEqual(exportQuote.calls[0][1], '3');
    assert.strictEqual(r.logs.length, 1);
});

for (const status of [404, 502, 503]) {
    test(`export-quote returns ${status} for a QuoteExportError`, async () => {
        const r = await call(stub(() => { throw new QuoteExportError(status, 'nope'); }));
        assert.strictEqual(r.status, status);
        assert.deepStrictEqual(r.json, { error: 'nope' });
        assert.strictEqual(r.logs.length, 1);
    });
}

test('export-quote returns 500 for an unexpected error', async () => {
    const r = await call(stub(() => { throw new Error('boom'); }));
    assert.strictEqual(r.status, 500);
    assert.ok(r.json.error);
    assert.strictEqual(r.logs.length, 1);
});

test('export-quote without a key returns 401 and does not export', async () => {
    const exportQuote = stub(() => ({}));
    const r = await call(exportQuote, { key: null });
    assert.strictEqual(r.status, 401);
    assert.strictEqual(exportQuote.calls.length, 0);
    assert.strictEqual(r.logs.length, 1);
});
