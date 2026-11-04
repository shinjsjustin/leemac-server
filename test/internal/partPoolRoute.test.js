const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const { start } = require('../helpers/server');
const { makeSqliteDb } = require('../helpers/sqliteDb');

const db = makeSqliteDb();
const dbPath = require.resolve('../../src/db/db.js');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: db };
const partRouter = require('../../src/routes/part');
const poolRouter = require('../../src/routes/partPool');

const MB = 1024 * 1024;

beforeEach(() => {
    db.sqlite.exec(`
        DROP TABLE IF EXISTS uploaded_files;
        DELETE FROM part;
        DELETE FROM sqlite_sequence WHERE name = 'part';
        CREATE TABLE uploaded_files (
            id INTEGER PRIMARY KEY AUTOINCREMENT, filename TEXT, mimetype TEXT, size INTEGER, content BLOB,
            part_id INTEGER, job_id INTEGER, note_id INTEGER, uploaded_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
    `);
});

async function call(method, path, { json, form } = {}) {
    const app = express();
    app.use(express.json());
    app.use('/part', poolRouter);
    app.use('/part', partRouter);
    const server = await start(app);
    try {
        const res = await fetch(`${server.baseUrl}/part${path}`, {
            method,
            headers: json ? { 'Content-Type': 'application/json' } : undefined,
            body: json ? JSON.stringify(json) : form,
        });
        return { status: res.status, body: await res.json() };
    } finally { await server.close(); }
}

const post = (json) => call('POST', '/pool', { json });

function fileForm(name, bytes = 10, type = 'application/pdf') {
    const form = new FormData();
    form.append('file', new Blob([Buffer.alloc(bytes, 1)], { type }), name);
    return form;
}
const upload = (id, form) => call('POST', `/pool/${id}/files`, { form });

test('POST /pool with only a number returns 201 with its id', async () => {
    const res = await post({ number: ' A-1 ' });
    assert.strictEqual(res.status, 201);
    assert.deepStrictEqual(res.body, { id: 1, number: 'A-1' });
    const [rows] = await db.execute('SELECT number, description FROM part');
    assert.deepStrictEqual(rows, [{ number: 'A-1', description: '' }]);
});

test('POST /pool duplicate returns 409 and leaves the first part unchanged', async () => {
    await post({ number: 'A-1', description: 'first' });
    const res = await post({ number: 'A-1', description: 'second' });
    assert.strictEqual(res.status, 409);
    assert.ok(res.body.error);
    const [rows] = await db.execute('SELECT number, description FROM part');
    assert.deepStrictEqual(rows, [{ number: 'A-1', description: 'first' }]);
});

test('POST /pool rejects bad numbers and descriptions with 400', async () => {
    const bad = [
        { number: '   ' },
        {},
        { number: 'x'.repeat(101) },
        { number: 'A', description: 'd'.repeat(256) },
    ];
    for (const body of bad) assert.strictEqual((await post(body)).status, 400, JSON.stringify(body).slice(0, 40));
    assert.strictEqual((await post({ number: 'x'.repeat(100), description: 'd'.repeat(255) })).status, 201);
});

test('POST /pool/:id/files stores an allowed file', async () => {
    await post({ number: 'A-1' });
    const res = await upload(1, fileForm('draw.pdf'));
    assert.strictEqual(res.status, 201);
    assert.deepStrictEqual(res.body, { id: 1 });
    const [rows] = await db.execute('SELECT filename, mimetype, size, part_id FROM uploaded_files');
    assert.deepStrictEqual(rows, [{ filename: 'draw.pdf', mimetype: 'application/pdf', size: 10, part_id: 1 }]);
});

test('POST /pool/:id/files refuses a wrong type, an oversize file and an 11th file', async () => {
    await post({ number: 'A-1' });
    const wrong = await upload(1, fileForm('run.exe', 10, 'application/octet-stream'));
    assert.strictEqual(wrong.status, 400);
    assert.ok(wrong.body.error);
    const big = await upload(1, fileForm('big.pdf', 20 * MB + 1));
    assert.strictEqual(big.status, 413);
    assert.ok(big.body.error);
    for (let i = 0; i < 10; i++) assert.strictEqual((await upload(1, fileForm(`f${i}.pdf`))).status, 201);
    const eleventh = await upload(1, fileForm('f10.pdf'));
    assert.strictEqual(eleventh.status, 400);
    assert.ok(eleventh.body.error);
    const [rows] = await db.execute('SELECT id FROM uploaded_files');
    assert.strictEqual(rows.length, 10);
});

test('POST /pool/:id/files is 400 with no file and 404 for a missing part', async () => {
    await post({ number: 'A-1' });
    const none = await upload(1, new FormData());
    assert.strictEqual(none.status, 400);
    const missing = await upload(99, fileForm('draw.pdf'));
    assert.strictEqual(missing.status, 404);
    const noFileFirst = await upload(99, new FormData());
    assert.strictEqual(noFileFirst.status, 400);
});

test('a pooled part and its PDF appear in GET /getparts, and the part in /searchparts', async () => {
    await post({ number: 'A-1', description: 'Bracket' });
    await upload(1, fileForm('draw.pdf'));
    const list = await call('GET', '/getparts');
    assert.deepStrictEqual(list.body, [{
        id: 1, number: 'A-1', description: 'Bracket', drawing_count: 1,
        latest_drawing: { id: 1, filename: 'draw.pdf', mimetype: 'application/pdf' },
    }]);
    const search = await call('GET', '/searchparts?searchTerm=a-1');
    assert.deepStrictEqual(search.body, [{ id: 1, number: 'A-1', description: 'Bracket', history: [] }]);
});
