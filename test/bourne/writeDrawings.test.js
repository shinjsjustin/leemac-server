const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const { start } = require('../helpers/server');
const { makeFakeTxDb } = require('../helpers/fakeTxDb');
const { createWriteLimiter } = require('../../src/middleware/isBourneWrite');
const { createBourneWriteRouter } = require('../../src/routes/bourne/write');

const KEY = 'test-bourne-write-key';
const MAX_BYTES = 20 * 1024 * 1024;
let saved;
beforeEach(() => { saved = process.env.BOURNE_WRITE_KEY; process.env.BOURNE_WRITE_KEY = KEY; });
afterEach(() => {
    if (saved === undefined) delete process.env.BOURNE_WRITE_KEY;
    else process.env.BOURNE_WRITE_KEY = saved;
});

const wait = () => new Promise((r) => setTimeout(r, 50));
async function call(handlers, form, { key = KEY } = {}) {
    const db = makeFakeTxDb(handlers);
    const app = express();
    app.use(express.json());
    app.use('/w', createBourneWriteRouter({ db, limiter: createWriteLimiter({ max: 1000 }) }));
    const s = await start(app);
    try {
        const headers = key ? { 'X-Bourne-Key': key } : {};
        const res = await fetch(`${s.baseUrl}/w/jobs/3/drawings`, { method: 'POST', headers, body: form });
        const json = await res.json();
        await wait();
        return { status: res.status, json, calls: db.calls };
    } finally { await s.close(); }
}
const logs = (calls) => calls.filter((c) => /INSERT INTO bourne_write_log/.test(c.sql));
const uploads = (calls) => calls.filter((c) => /INSERT INTO uploaded_files/.test(c.sql));

const JOB = { match: /SELECT id FROM job WHERE id/, rows: [{ id: 3 }] };
const PART_INSERT = { match: /INSERT IGNORE INTO part/, rows: { affectedRows: 1, insertId: 7 } };
const JOB_PART_INSERT = { match: /INSERT INTO job_part/, rows: { insertId: 5 } };
const FILE_INSERT = { match: /INSERT INTO uploaded_files/, rows: { insertId: 11 } };
const HANDLERS = [JOB, PART_INSERT, JOB_PART_INSERT, FILE_INSERT];

const file = (name, size = 4) => new File([Buffer.alloc(size, 'a')], name);
function form({ drawing, step, extraDrawing, fields = { part_number: 'P-1', title: 'Bracket', quantity: '2', price: '3.5' } } = {}) {
    const f = new FormData();
    for (const [k, v] of Object.entries(fields)) f.append(k, v);
    if (drawing) f.append('drawing', file(drawing, drawing.size));
    if (extraDrawing) f.append('drawing', file(extraDrawing));
    if (step) f.append('step', file(step));
    return f;
}

test('drawing with a pdf answers 201 with the lib result and attaches one file', async () => {
    const r = await call(HANDLERS, form({ drawing: 'a.pdf' }));
    assert.strictEqual(r.status, 201);
    assert.deepStrictEqual(r.json, { job_part_id: 5, part_id: 7, part_created: true, file_ids: [11] });
    assert.strictEqual(uploads(r.calls).length, 1);
    assert.strictEqual(logs(r.calls).length, 1);
});

test('drawing with a pdf and a step attaches both', async () => {
    const r = await call(HANDLERS, form({ drawing: 'a.pdf', step: 'a.step' }));
    assert.strictEqual(r.status, 201);
    assert.deepStrictEqual(r.json.file_ids, [11, 11]);
    assert.deepStrictEqual(uploads(r.calls).map((c) => c.params[0]), ['a.pdf', 'a.step']);
});

test('drawing returns 404 for an unknown job without writing', async () => {
    const r = await call([PART_INSERT, JOB_PART_INSERT, FILE_INSERT], form({ drawing: 'a.pdf' }));
    assert.strictEqual(r.status, 404);
    assert.strictEqual(uploads(r.calls).length, 0);
    assert.strictEqual(logs(r.calls).length, 1);
});

test('drawing returns 401 for a wrong key and a missing key without writing', async () => {
    for (const key of ['wrong', null]) {
        const r = await call(HANDLERS, form({ drawing: 'a.pdf' }), { key });
        assert.strictEqual(r.status, 401);
        assert.strictEqual(uploads(r.calls).length, 0);
        assert.strictEqual(logs(r.calls).length, 1);
    }
});

const REJECTS = [
    ['a disallowed file type', () => form({ drawing: 'a.exe' }), 400],
    ['a second drawing file', () => form({ drawing: 'a.pdf', extraDrawing: 'b.pdf' }), 400],
    ['a missing drawing', () => form({ step: 'a.step' }), 400],
    ['a non-pdf drawing', () => form({ drawing: 'a.step' }), 400],
    ['a missing part number', () => form({ drawing: 'a.pdf', fields: { title: 'x' } }), 400],
    ['a file over 20 MB', () => {
        const f = form();
        f.append('drawing', file('a.pdf', MAX_BYTES + 1));
        return f;
    }, 413],
];
for (const [name, make, status] of REJECTS) {
    test(`drawing returns ${status} for ${name} without inserting`, async () => {
        const r = await call(HANDLERS, make());
        assert.strictEqual(r.status, status);
        assert.strictEqual(uploads(r.calls).length, 0);
        assert.strictEqual(logs(r.calls).length, 1);
    });
}

test('drawing answers 500 when the database fails', async () => {
    const r = await call([JOB, { match: /INSERT IGNORE INTO part/, error: new Error('boom') }], form({ drawing: 'a.pdf' }));
    assert.strictEqual(r.status, 500);
    assert.deepStrictEqual(r.json, { error: 'Failed to add drawing' });
});
