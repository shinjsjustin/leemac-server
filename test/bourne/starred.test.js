const { test } = require('node:test');
const assert = require('node:assert');
const { start } = require('../helpers/server');
const { makeFakeDb } = require('../helpers/fakeDb');
const express = require('express');

const KEY = process.env.BOURNE_READ_KEY;

const STAR_ROWS = [
    { job_id: 1, job_number: 'J-1', client: 'Acme', attention: 'Bob', po_number: 'PO1', po_date: '2026-01-01', due_date: '2026-02-01', ship_date: null, created_at: '2026-01-01T00:00:00Z', invoice_number: 'INV1', invoice_date: null, invoice_status: 'waiting', job_part_id: 10, part_id: 100, number: 'P-100', description: 'Bracket', quantity: 5, price: 20, rev: 'A', details: 'anodize', note: 'rush', star_status: 'done', star_attention: 'Bob', nfc_tag_id: 'nfc1' },
    { job_id: 1, job_number: 'J-1', client: 'Acme', attention: 'Bob', po_number: 'PO1', po_date: '2026-01-01', due_date: '2026-02-01', ship_date: null, created_at: '2026-01-01T00:00:00Z', invoice_number: 'INV1', invoice_date: null, invoice_status: 'waiting', job_part_id: 11, part_id: 101, number: 'P-101', description: 'Plate', quantity: 1, price: 9, rev: null, details: null, note: null, star_status: 'invoiced', star_attention: null, nfc_tag_id: null },
    { job_id: 2, job_number: 'J-2', client: 'Zed', attention: null, po_number: null, po_date: null, due_date: null, ship_date: null, created_at: '2026-01-05T00:00:00Z', invoice_number: null, invoice_date: null, invoice_status: 'paid', job_part_id: 12, part_id: 102, number: 'P-102', description: 'Pin', quantity: 2, price: 3, rev: 'B', details: null, note: null, star_status: 'open', star_attention: 'Al', nfc_tag_id: null },
];
const NOTE_ROWS = [
    { id: 7, job_id: 1, content: 'call client', status: 'new', created_at: '2026-01-02T00:00:00Z', author: 'Sam' },
];
const PART_FILES = [
    { id: 50, part_id: 100, filename: 'a.pdf', mimetype: 'application/pdf', size: 123, uploaded_at: '2026-01-03T00:00:00Z' },
];
const NOTE_FILES = [
    { id: 51, note_id: 7, filename: 'n.png', mimetype: 'image/png', size: 9, uploaded_at: '2026-01-04T00:00:00Z' },
];

function fullDb() {
    return makeFakeDb([
        { match: /FROM stars/, rows: STAR_ROWS },
        { match: /FROM note/, rows: NOTE_ROWS },
        { match: /FROM uploaded_files[\s\S]*part_id IN/, rows: PART_FILES },
        { match: /FROM uploaded_files[\s\S]*note_id IN/, rows: NOTE_FILES },
    ]);
}

async function get(db) {
    const { createBourneRouter } = require('../../src/routes/bourne');
    const app = express();
    app.use('/api/bourne', createBourneRouter({ db }));
    const server = await start(app);
    try {
        const res = await fetch(`${server.baseUrl}/api/bourne/starred`, { headers: { 'X-Bourne-Key': KEY } });
        return { status: res.status, body: await res.json() };
    } finally { await server.close(); }
}

test('groups starred parts by job with job fields, notes and files', async () => {
    const db = fullDb();
    const { status, body } = await get(db);
    assert.strictEqual(status, 200);
    assert.deepStrictEqual(Object.keys(body), ['jobs']);
    assert.strictEqual(body.jobs.length, 2);
    const [j1, j2] = body.jobs;
    assert.deepStrictEqual(Object.keys(j1), ['job_id', 'job_number', 'client', 'attention', 'po_number', 'po_date', 'due_date', 'ship_date', 'created_at', 'invoice_number', 'invoice_date', 'invoice_status', 'notes', 'parts']);
    assert.strictEqual(j1.client, 'Acme');
    assert.strictEqual(j1.invoice_status, 'waiting');
    assert.strictEqual(j1.parts.length, 2);
    assert.strictEqual(j2.parts.length, 1);
    assert.deepStrictEqual(j1.parts[0], {
        job_part_id: 10, part_id: 100, number: 'P-100', description: 'Bracket', quantity: 5, price: 20,
        rev: 'A', details: 'anodize', note: 'rush',
        star: { status: 'done', attention: 'Bob', nfc_tag_id: 'nfc1' },
        files: [{ id: 50, filename: 'a.pdf', mimetype: 'application/pdf', size: 123, uploaded_at: '2026-01-03T00:00:00Z' }],
    });
    assert.deepStrictEqual(j1.parts[1].files, []);
    assert.strictEqual(j1.parts[1].star.status, 'invoiced');
    assert.deepStrictEqual(j1.notes, [{
        id: 7, content: 'call client', status: 'new', created_at: '2026-01-02T00:00:00Z', author: 'Sam',
        files: [{ id: 51, filename: 'n.png', mimetype: 'image/png', size: 9, uploaded_at: '2026-01-04T00:00:00Z' }],
    }]);
    assert.deepStrictEqual(j2.notes, []);
});

test('only issues SELECTs, batches lookups with IN, and never selects content or secrets', async () => {
    const db = fullDb();
    await get(db);
    assert.strictEqual(db.calls.length, 4);
    for (const { sql } of db.calls) {
        assert.match(sql.trim(), /^SELECT/);
        assert.doesNotMatch(sql, /\*|password|token|google_|\buf\.content\b/i);
    }
    const files = db.calls.filter((c) => /uploaded_files/.test(c.sql));
    assert.deepStrictEqual(files.map((c) => c.params), [[100, 101, 102], [7]]);
    assert.deepStrictEqual(db.calls.find((c) => /FROM note/.test(c.sql)).params, [1, 2]);
});

test('response holds no file content, password or token', async () => {
    const { body } = await get(fullDb());
    assert.doesNotMatch(JSON.stringify(body), /"(content_blob|password|token|google_[a-z_]+)"/);
});

test('returns empty jobs and skips lookups when nothing is starred', async () => {
    const db = makeFakeDb();
    const { status, body } = await get(db);
    assert.strictEqual(status, 200);
    assert.deepStrictEqual(body, { jobs: [] });
    assert.strictEqual(db.calls.length, 1);
});

test('returns 500 JSON when the db fails', async () => {
    const db = { execute: async () => { throw new Error('boom'); }, query: async () => { throw new Error('boom'); } };
    const { status, body } = await get(db);
    assert.strictEqual(status, 500);
    assert.ok(body.error);
});
