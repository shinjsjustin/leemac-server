const { test } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const { start } = require('../helpers/server');
const { makeFakeDb } = require('../helpers/fakeDb');
const { assertMysqlQuotesClosed } = require('../helpers/mysqlSql');

const KEY = process.env.BOURNE_READ_KEY;

const LIST_ROW = { id: 3, company: 'Acme', client_name: 'Bob', name: 'Brackets', need_by: '2026-03-01', status: 'sent', submitted_at: '2026-02-01T00:00:00Z', line_count: 2 };
const HEADER = { id: 3, company: 'Acme', client_name: 'Bob', name: 'Brackets', need_by: '2026-03-01', note: 'rush', status: 'sent', job_id: null, submitted_at: '2026-02-01T00:00:00Z', reviewed_at: null };
const LINES = [
    { id: 10, position: 1, part_number: 'P-1', description: 'Bracket', rev: 'A', material: 'Al', finish: 'None', quantity: 5, part_id: 7, price: '9.99', bourne_suggestion: '{"part_id":7}' },
    { id: 11, position: 2, part_number: 'P-2', description: 'Plate', rev: null, material: null, finish: null, quantity: 1, part_id: null, price: '1.00', bourne_suggestion: { a: 1 } },
];
const FILES = [{ id: 20, line_id: 10, filename: 'a.pdf', mimetype: 'application/pdf', size: 4, content: Buffer.from('xxxx') }];

function makeDb({ header = [HEADER], file = [] } = {}) {
    return makeFakeDb([
        { match: /FROM quote_request_line/, rows: LINES },
        { match: /FROM quote_request_file WHERE id/, rows: file },
        { match: /FROM quote_request_file/, rows: FILES },
        { match: /FROM quote_request r/, rows: header },
    ]);
}

async function get(db, path) {
    const { createBourneRouter } = require('../../src/routes/bourne');
    const app = express();
    app.use('/api/bourne', createBourneRouter({ db }));
    const server = await start(app);
    try {
        const res = await fetch(`${server.baseUrl}/api/bourne/quote-requests${path}`, { headers: { 'X-Bourne-Key': KEY } });
        const buf = Buffer.from(await res.arrayBuffer());
        return { status: res.status, buf, type: res.headers.get('content-type'), text: buf.toString() };
    } finally { await server.close(); }
}

const checkSql = (db) => db.calls.forEach((c) => assertMysqlQuotesClosed(c.sql));

test('lists non-draft requests with explicit columns and no price', async () => {
    const db = makeFakeDb([{ match: /FROM quote_request/, rows: [{ ...LIST_ROW, price: '5' }] }]);
    const res = await get(db, '');
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(JSON.parse(res.text), { quoteRequests: [LIST_ROW] });
    const { sql } = db.calls[0];
    assert.match(sql, /status <> 'draft'/);
    assert.match(sql, /COUNT\(/);
    assert.doesNotMatch(sql, /\*\s*[,F]|price/i);
    checkSql(db);
});

test('detail returns header, lines with parsed suggestion, files, and no price or content', async () => {
    const db = makeDb();
    const res = await get(db, '/3');
    assert.strictEqual(res.status, 200);
    const body = JSON.parse(res.text);
    assert.strictEqual(body.quoteRequest.company, 'Acme');
    assert.strictEqual(body.quoteRequest.note, 'rush');
    assert.deepStrictEqual(body.quoteRequest.lines.map((l) => l.bourne_suggestion), [{ part_id: 7 }, { a: 1 }]);
    assert.strictEqual(body.quoteRequest.lines[0].part_number, 'P-1');
    assert.deepStrictEqual(body.quoteRequest.files, [{ id: 20, line_id: 10, filename: 'a.pdf', mimetype: 'application/pdf', size: 4 }]);
    assert.doesNotMatch(res.text, /price|content/);
    for (const c of db.calls) assert.doesNotMatch(c.sql, /price/i);
    assert.ok(db.calls.some((c) => /ORDER BY position/.test(c.sql)));
    assert.match(db.calls[0].sql, /status <> 'draft'/);
    checkSql(db);
});

test('detail is 404 for a draft or missing request and 400 for a bad id', async () => {
    assert.strictEqual((await get(makeDb({ header: [] }), '/3')).status, 404);
    assert.strictEqual((await get(makeDb(), '/abc')).status, 400);
});

test('streams a file of that request', async () => {
    const db = makeDb({ file: [FILES[0]] });
    const res = await get(db, '/3/files/20');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.type, 'application/pdf');
    assert.strictEqual(res.text, 'xxxx');
    const call = db.calls.find((c) => /quote_request_file/.test(c.sql));
    assert.deepStrictEqual(call.params, [20, 3]);
    assert.match(call.sql, /request_id = \?/);
    checkSql(db);
});

test('file of another request is 404', async () => {
    assert.strictEqual((await get(makeDb({ file: [] }), '/3/files/21')).status, 404);
});
