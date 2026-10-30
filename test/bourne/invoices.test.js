const { test } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const { start } = require('../helpers/server');
const { makeFakeDb } = require('../helpers/fakeDb');

const KEY = process.env.BOURNE_READ_KEY;
const PDF = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x00, 0xff, 0xfe, 0x80, 0x0a]);
const FILE = { id: 9, filename: 'Invoice-J1-20260101-site.pdf', mimetype: 'application/pdf', content: PDF };

function dbWith(job, file) {
    return makeFakeDb([
        { match: /FROM job /, rows: job ? [job] : [] },
        { match: /FROM uploaded_files/, rows: file ? [file] : [] },
    ]);
}

async function get(db, number, headers = { 'X-Bourne-Key': KEY }) {
    const { createBourneRouter } = require('../../src/routes/bourne');
    const app = express();
    app.use('/api/bourne', createBourneRouter({ db }));
    const server = await start(app);
    try {
        const res = await fetch(`${server.baseUrl}/api/bourne/invoices/${encodeURIComponent(number)}/pdf`, { headers });
        return { res, bytes: Buffer.from(await res.arrayBuffer()) };
    } finally { await server.close(); }
}

test('returns the site PDF bytes as application/pdf with inline filename', async () => {
    const { res, bytes } = await get(dbWith({ id: 3, job_number: 'J1' }, FILE), 'INV-7');
    assert.strictEqual(res.status, 200);
    assert.ok(bytes.equals(PDF));
    assert.strictEqual(res.headers.get('content-type'), 'application/pdf');
    assert.strictEqual(res.headers.get('content-length'), String(PDF.length));
    assert.strictEqual(res.headers.get('content-disposition'), 'inline; filename="Invoice-J1-20260101-site.pdf"');
});

test('strips unsafe characters from the filename', async () => {
    const file = { ...FILE, filename: 'In"v\\\r\n\x00.pdf' };
    const { res } = await get(dbWith({ id: 3, job_number: 'J1' }, file), 'INV-7');
    assert.strictEqual(res.headers.get('content-disposition'), 'inline; filename="Inv.pdf"');
});

test('issues two single SELECTs with the trimmed number and job id bound', async () => {
    const db = dbWith({ id: 3, job_number: 'J1' }, FILE);
    await get(db, '  INV-7 ');
    assert.strictEqual(db.calls.length, 2);
    assert.match(db.calls[0].sql.trim(), /^SELECT id, job_number FROM job WHERE invoice_number_key = \?$/);
    assert.deepStrictEqual(db.calls[0].params, ['INV-7']);
    const sql = db.calls[1].sql.replace(/\s+/g, ' ').trim();
    assert.match(sql, /^SELECT id, filename, mimetype, content FROM uploaded_files WHERE job_id = \? AND filename LIKE 'Invoice-%-site\.pdf' ORDER BY uploaded_at DESC, id DESC LIMIT 1$/);
    assert.deepStrictEqual(db.calls[1].params, [3]);
});

test('returns 404 when no job has the number, without a file query', async () => {
    const db = dbWith(null, FILE);
    const { res, bytes } = await get(db, 'NOPE');
    assert.strictEqual(res.status, 404);
    assert.strictEqual(JSON.parse(bytes.toString()).error, 'Invoice not found.');
    assert.strictEqual(db.calls.length, 1);
});

test('returns 404 when the job has no site invoice PDF', async () => {
    const { res, bytes } = await get(dbWith({ id: 3, job_number: 'J1' }, null), 'INV-7');
    assert.strictEqual(res.status, 404);
    assert.strictEqual(JSON.parse(bytes.toString()).error, 'No saved PDF for this invoice.');
});

test('returns 400 for a blank number without querying', async () => {
    const db = dbWith({ id: 3, job_number: 'J1' }, FILE);
    const { res, bytes } = await get(db, '   ');
    assert.strictEqual(res.status, 400);
    assert.ok(JSON.parse(bytes.toString()).error);
    assert.strictEqual(db.calls.length, 0);
});

test('accepts 50 characters and rejects 51 without querying', async () => {
    const ok = dbWith({ id: 3, job_number: 'J1' }, FILE);
    assert.strictEqual((await get(ok, 'a'.repeat(50))).res.status, 200);
    const db = dbWith({ id: 3, job_number: 'J1' }, FILE);
    const { res } = await get(db, 'a'.repeat(51));
    assert.strictEqual(res.status, 400);
    assert.strictEqual(db.calls.length, 0);
});

test('returns 401 without the key', async () => {
    const db = dbWith({ id: 3, job_number: 'J1' }, FILE);
    const { res } = await get(db, 'INV-7', {});
    assert.strictEqual(res.status, 401);
    assert.strictEqual(db.calls.length, 0);
});

test('returns 500 JSON when the database fails', async () => {
    const db = makeFakeDb();
    db.execute = async () => { throw new Error('boom'); };
    const orig = console.error;
    console.error = () => {};
    try {
        const { res, bytes } = await get(db, 'INV-7');
        assert.strictEqual(res.status, 500);
        assert.ok(JSON.parse(bytes.toString()).error);
    } finally { console.error = orig; }
});
