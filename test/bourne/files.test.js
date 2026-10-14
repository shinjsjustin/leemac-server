const { test } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const { start } = require('../helpers/server');
const { makeFakeDb } = require('../helpers/fakeDb');

const KEY = process.env.BOURNE_READ_KEY;
const PDF = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x00, 0xff, 0xfe, 0x80, 0x0a]);

function dbWith(row) {
    return makeFakeDb([{ match: /FROM uploaded_files/, rows: row ? [row] : [] }]);
}

async function get(db, id, headers = { 'X-Bourne-Key': KEY }) {
    const { createBourneRouter } = require('../../src/routes/bourne');
    const app = express();
    app.use('/api/bourne', createBourneRouter({ db }));
    const server = await start(app);
    try {
        const res = await fetch(`${server.baseUrl}/api/bourne/files/${id}`, { headers });
        return { res, bytes: Buffer.from(await res.arrayBuffer()) };
    } finally { await server.close(); }
}

test('returns stored bytes unchanged with mimetype and inline filename', async () => {
    const db = dbWith({ id: 5, filename: 'draw.pdf', mimetype: 'application/pdf', content: PDF });
    const { res, bytes } = await get(db, 5);
    assert.strictEqual(res.status, 200);
    assert.ok(bytes.equals(PDF));
    assert.strictEqual(res.headers.get('content-type'), 'application/pdf');
    assert.strictEqual(res.headers.get('content-length'), String(PDF.length));
    assert.strictEqual(res.headers.get('content-disposition'), 'inline; filename="draw.pdf"');
});

test('issues one SELECT on uploaded_files with the bound id', async () => {
    const db = dbWith({ id: 5, filename: 'a.pdf', mimetype: 'application/pdf', content: PDF });
    await get(db, 5);
    assert.strictEqual(db.calls.length, 1);
    assert.match(db.calls[0].sql.trim(), /^SELECT id, filename, mimetype, content FROM uploaded_files WHERE id = \?$/);
    assert.deepStrictEqual(db.calls[0].params, [5]);
});

test('strips quotes, backslashes and control characters from the filename', async () => {
    const db = dbWith({ id: 5, filename: 'a"b\\c\r\nd\x00.pdf', mimetype: 'application/pdf', content: PDF });
    const { res } = await get(db, 5);
    assert.strictEqual(res.headers.get('content-disposition'), 'inline; filename="abcd.pdf"');
});

test('falls back to application/octet-stream without a mimetype', async () => {
    const db = dbWith({ id: 5, filename: 'x.bin', mimetype: null, content: PDF });
    const { res, bytes } = await get(db, 5);
    assert.strictEqual(res.headers.get('content-type'), 'application/octet-stream');
    assert.ok(bytes.equals(PDF));
});

test('returns 400 for a non-integer id without querying', async () => {
    const db = dbWith(null);
    const { res, bytes } = await get(db, 'abc');
    assert.strictEqual(res.status, 400);
    assert.ok(JSON.parse(bytes.toString()).error);
    assert.strictEqual(db.calls.length, 0);
});

test('returns 404 JSON for an unknown id', async () => {
    const { res, bytes } = await get(dbWith(null), 99);
    assert.strictEqual(res.status, 404);
    assert.ok(JSON.parse(bytes.toString()).error);
});

test('returns 401 without the key', async () => {
    const db = dbWith({ id: 5, filename: 'a.pdf', mimetype: 'application/pdf', content: PDF });
    const { res } = await get(db, 5, {});
    assert.strictEqual(res.status, 401);
    assert.strictEqual(db.calls.length, 0);
});
