const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const { start } = require('../helpers/server');
const { makeFakeTxDb } = require('../helpers/fakeTxDb');
const { assertMysqlQuotesClosed } = require('../helpers/mysqlSql');
const { createWriteLimiter } = require('../../src/middleware/isBourneWrite');
const { createBourneWriteRouter } = require('../../src/routes/bourne/write');

const KEY = 'test-bourne-write-key';
let saved;
beforeEach(() => { saved = process.env.BOURNE_WRITE_KEY; process.env.BOURNE_WRITE_KEY = KEY; });
afterEach(() => {
    if (saved === undefined) delete process.env.BOURNE_WRITE_KEY;
    else process.env.BOURNE_WRITE_KEY = saved;
});

const wait = () => new Promise((r) => setTimeout(r, 50));
async function call(handlers, path, body = {}) {
    const db = makeFakeTxDb(handlers);
    const app = express();
    app.use(express.json());
    app.use('/w', createBourneWriteRouter({ db, limiter: createWriteLimiter({ max: 1000 }) }));
    const s = await start(app);
    try {
        const res = await fetch(`${s.baseUrl}/w${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Bourne-Key': KEY },
            body: JSON.stringify(body),
        });
        const json = await res.json();
        await wait();
        db.calls.filter((c) => c.sql).forEach((c) => assertMysqlQuotesClosed(c.sql));
        return { status: res.status, json, calls: db.calls };
    } finally { await s.close(); }
}
const logs = (calls) => calls.filter((c) => /INSERT INTO bourne_write_log/.test(c.sql));
const updates = (calls) => calls.filter((c) => /UPDATE quote_request_line/.test(c.sql));

const PATH = '/quote-requests/7/lines/11/suggest';
const request = (status) => ({ match: /FROM quote_request WHERE id = \? FOR UPDATE/, rows: [{ id: 7, status }] });
const LINE = { match: /FROM quote_request_line WHERE id = \? AND request_id = \?/, rows: [{ id: 11 }] };

test('suggest stores the allowed fields as JSON and answers 200', async () => {
    const r = await call([request('submitted'), LINE], PATH, { part_number: ' A-1 ', rev: 'B', material: 'Al', finish: 'Anod', description: 'Bracket' });
    const json = '{"part_number":"A-1","rev":"B","material":"Al","finish":"Anod","description":"Bracket"}';
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(r.json, { line_id: 11, bourne_suggestion: JSON.parse(json) });
    assert.strictEqual(updates(r.calls).length, 1);
    assert.deepStrictEqual(updates(r.calls)[0].params, [json, 11, 7]);
    assert.strictEqual(logs(r.calls).length, 1);
});

test('suggest trims values to the column sizes', async () => {
    const r = await call([request('in_review'), LINE], PATH, { rev: 'x'.repeat(30) });
    assert.strictEqual(r.json.bourne_suggestion.rev, 'x'.repeat(10));
});

test('suggest rejects price, other keys, no keys and non-string values with 400 and no UPDATE', async () => {
    for (const body of [{ price: 5 }, { rev: 'A', price: 5 }, { rev: 'A', quantity: 2 }, {}, { rev: 4 }]) {
        const r = await call([request('submitted'), LINE], PATH, body);
        assert.strictEqual(r.status, 400);
        assert.strictEqual(updates(r.calls).length, 0);
        assert.strictEqual(logs(r.calls).length, 1);
    }
});

test('suggest answers 404 or 409 without an UPDATE', async () => {
    const cases = [
        [[], PATH, 404],
        [[request('draft'), LINE], PATH, 404],
        [[request('submitted')], PATH, 404],
        [[request('job_created'), LINE], PATH, 409],
    ];
    for (const [handlers, path, status] of cases) {
        const r = await call(handlers, path, { rev: 'A' });
        assert.strictEqual(r.status, status);
        assert.strictEqual(updates(r.calls).length, 0);
        assert.strictEqual(logs(r.calls).length, 1);
    }
});

test('suggest rejects non-numeric ids with 400', async () => {
    for (const path of ['/quote-requests/abc/lines/11/suggest', '/quote-requests/7/lines/x/suggest']) {
        const r = await call([request('submitted'), LINE], path, { rev: 'A' });
        assert.strictEqual(r.status, 400);
        assert.strictEqual(updates(r.calls).length, 0);
    }
});
