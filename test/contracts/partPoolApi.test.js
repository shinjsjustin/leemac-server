const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { start } = require('../helpers/server');
const { makeSqliteDb } = require('../helpers/sqliteDb');

const db = makeSqliteDb();
db.sqlite.exec(`CREATE TABLE uploaded_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT, filename TEXT, mimetype TEXT, size INTEGER,
    content BLOB, part_id INTEGER, job_id INTEGER, uploaded_at TEXT)`);
const dbPath = require.resolve('../../src/db/db.js');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: db };

const contracts = require('../../src/client/src/api/contracts/partPoolApi.json');
const router = require('../../src/routes/partPool');

async function post(path, init) {
    const app = express();
    app.use(express.json());
    app.use('/internal/part', router);
    const { baseUrl, close } = await start(app);
    try {
        return await fetch(`${baseUrl}${path}`, { method: 'POST', ...init });
    } finally {
        await close();
    }
}

let partId;

before(async () => {
    const entry = contracts.addPoolPart;
    const res = await post(entry.path, {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry.body),
    });
    assert.equal(res.status, 201);
    partId = (await res.json()).id;
});

test('addPoolPart fixture body is stored by the real router', async () => {
    const row = db.sqlite.prepare('SELECT number, description FROM part WHERE id = ?').get(partId);
    assert.deepEqual({ ...row }, contracts.addPoolPart.body);
});

test('uploadPoolFile fixture multipart body answers 201 and stores the file', async () => {
    const entry = contracts.uploadPoolFile;
    const form = new FormData();
    form.append(entry.formField, new Blob(['%PDF-1.4'], { type: 'application/pdf' }), entry.args[1]);
    const res = await post(`/internal/part/pool/${partId}/files`, { body: form });
    assert.equal(res.status, 201);
    const row = db.sqlite.prepare('SELECT filename, part_id FROM uploaded_files WHERE id = ?').get((await res.json()).id);
    assert.deepEqual({ ...row }, { filename: entry.args[1], part_id: partId });
});
