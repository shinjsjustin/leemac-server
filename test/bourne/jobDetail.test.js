const { test } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const { start } = require('../helpers/server');
const { makeFakeDb } = require('../helpers/fakeDb');

const KEY = process.env.BOURNE_READ_KEY;

const JOB = { id: 3, job_number: '103', client: 'Acme', attention: 'Bob', po_number: 'PO1', po_date: '2026-01-01', due_date: '2026-02-01', ship_date: null, created_at: '2026-01-01T00:00:00Z', invoice_number: 'INV1', invoice_date: null, invoice_status: 'waiting', subtotal: 100, tax: '8.00', tax_percent: '8.00', total_cost: 108 };
const PART_ROWS = [
    { job_part_id: 10, part_id: 100, number: 'P-100', description: 'Bracket', quantity: 5, price: 20, rev: 'A', details: 'anodize', note: 'rush', star_status: 'done', star_attention: 'Bob', nfc_tag_id: 'nfc1' },
    { job_part_id: 11, part_id: 101, number: 'P-101', description: 'Plate', quantity: 1, price: 9, rev: null, details: null, note: null, star_status: null, star_attention: null, nfc_tag_id: null },
];
const NOTE_ROWS = [{ id: 7, content: 'call client', status: 'new', created_at: '2026-01-02T00:00:00Z', author: 'Sam' }];
const PART_FILES = [{ id: 50, part_id: 100, filename: 'a.pdf', mimetype: 'application/pdf', size: 123, uploaded_at: '2026-01-03T00:00:00Z' }];
const NOTE_FILES = [{ id: 51, note_id: 7, filename: 'n.png', mimetype: 'image/png', size: 9, uploaded_at: '2026-01-04T00:00:00Z' }];
const EXPENSES = [{ id: 4, description: 'Anodizing', vendor: 'AnoCo', amount: '55.00', expense_date: '2026-01-10', category: 'outside' }];

function fullDb(jobRows = [JOB]) {
    return makeFakeDb([
        { match: /FROM job j/, rows: jobRows },
        { match: /FROM job_part/, rows: PART_ROWS },
        { match: /FROM note/, rows: NOTE_ROWS },
        { match: /FROM expense_job/, rows: EXPENSES },
        { match: /FROM uploaded_files[\s\S]*part_id IN/, rows: PART_FILES },
        { match: /FROM uploaded_files[\s\S]*note_id IN/, rows: NOTE_FILES },
    ]);
}

async function get(db, id) {
    const { createBourneRouter } = require('../../src/routes/bourne');
    const app = express();
    app.use('/api/bourne', createBourneRouter({ db }));
    const server = await start(app);
    try {
        const res = await fetch(`${server.baseUrl}/api/bourne/jobs/${id}`, { headers: { 'X-Bourne-Key': KEY } });
        return { status: res.status, body: await res.json() };
    } finally { await server.close(); }
}

test('returns the full job with parts, stars, notes, files and expenses', async () => {
    const { status, body } = await get(fullDb(), 3);
    assert.strictEqual(status, 200);
    assert.deepStrictEqual(Object.keys(body), ['job']);
    const { parts, notes, expenses, ...fields } = body.job;
    assert.deepStrictEqual(fields, JOB);
    assert.deepStrictEqual(parts, [
        {
            job_part_id: 10, part_id: 100, number: 'P-100', description: 'Bracket', quantity: 5, price: 20,
            rev: 'A', details: 'anodize', note: 'rush',
            star: { status: 'done', attention: 'Bob', nfc_tag_id: 'nfc1' },
            files: [{ id: 50, filename: 'a.pdf', mimetype: 'application/pdf', size: 123, uploaded_at: '2026-01-03T00:00:00Z' }],
        },
        {
            job_part_id: 11, part_id: 101, number: 'P-101', description: 'Plate', quantity: 1, price: 9,
            rev: null, details: null, note: null, star: null, files: [],
        },
    ]);
    assert.deepStrictEqual(notes, [{
        id: 7, content: 'call client', status: 'new', created_at: '2026-01-02T00:00:00Z', author: 'Sam',
        files: [{ id: 51, filename: 'n.png', mimetype: 'image/png', size: 9, uploaded_at: '2026-01-04T00:00:00Z' }],
    }]);
    assert.deepStrictEqual(expenses, EXPENSES);
});

test('returns 400 for a non-integer id and never queries', async () => {
    const db = fullDb();
    const { status, body } = await get(db, 'abc');
    assert.strictEqual(status, 400);
    assert.ok(body.error);
    assert.strictEqual(db.calls.length, 0);
});

test('returns 404 JSON for an unknown id', async () => {
    const { status, body } = await get(fullDb([]), 999);
    assert.strictEqual(status, 404);
    assert.ok(body.error);
});

test('only issues SELECTs without content, secrets or *', async () => {
    const db = fullDb();
    await get(db, 3);
    assert.ok(db.calls.length >= 6);
    for (const { sql } of db.calls) {
        assert.match(sql.trim(), /^SELECT/);
        assert.doesNotMatch(sql, /\*|password|token|google_|\buf\.content\b/i);
    }
    const files = db.calls.filter((c) => /uploaded_files/.test(c.sql));
    assert.deepStrictEqual(files.map((c) => c.params), [[100, 101], [7]]);
});
