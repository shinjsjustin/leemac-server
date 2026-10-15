const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const { start } = require('../helpers/server');

const dbPath = require.resolve('../../src/db/db.js');
let calls;
let nextId;
let listRows;
require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: {
        execute: async (sql, params) => {
            calls.push({ sql, params });
            if (/^\s*INSERT/i.test(sql)) { nextId += 1; return [{ insertId: nextId }]; }
            return [listRows];
        },
    },
};

beforeEach(() => {
    calls = [];
    nextId = 100;
    listRows = [];
});

async function withServer(fn) {
    const app = express();
    app.use(express.json());
    app.use('/job', require('../../src/routes/job'));
    const server = await start(app);
    try {
        return await fn(`${server.baseUrl}/job`);
    } finally {
        await server.close();
    }
}

function form(files) {
    const fd = new FormData();
    for (const [name, content] of files) fd.append('files', new Blob([content], { type: 'application/octet-stream' }), name);
    return fd;
}

test('upload inserts two files for the job and returns 201 with ids', () =>
    withServer(async (base) => {
        const res = await fetch(`${base}/uploadfile?id=7`, { method: 'POST', body: form([['a.pdf', 'aa'], ['b.STEP', 'bbb']]) });
        assert.strictEqual(res.status, 201);
        assert.deepStrictEqual((await res.json()).ids, [101, 102]);
        const inserts = calls.filter((c) => /INSERT INTO uploaded_files/.test(c.sql));
        assert.strictEqual(inserts.length, 2);
        assert.strictEqual(inserts[0].params[4], '7');
        assert.strictEqual(inserts[1].params[0], 'b.STEP');
    }));

test('upload returns 400 for a disallowed extension without inserting', () =>
    withServer(async (base) => {
        const res = await fetch(`${base}/uploadfile?id=7`, { method: 'POST', body: form([['evil.exe', 'x']]) });
        assert.strictEqual(res.status, 400);
        assert.ok((await res.json()).error);
        assert.strictEqual(calls.length, 0);
    }));

test('upload returns 413 for a file over 20 MB without inserting', () =>
    withServer(async (base) => {
        const big = Buffer.alloc(20 * 1024 * 1024 + 1);
        const res = await fetch(`${base}/uploadfile?id=7`, { method: 'POST', body: form([['big.pdf', big]]) });
        assert.strictEqual(res.status, 413);
        assert.ok((await res.json()).error);
        assert.strictEqual(calls.length, 0);
    }));

test('upload returns 400 when no files are sent', () =>
    withServer(async (base) => {
        const res = await fetch(`${base}/uploadfile?id=7`, { method: 'POST', body: new FormData() });
        assert.strictEqual(res.status, 400);
        assert.strictEqual(calls.length, 0);
    }));

test('upload returns 400 when the job id is missing', () =>
    withServer(async (base) => {
        const res = await fetch(`${base}/uploadfile`, { method: 'POST', body: form([['a.pdf', 'aa']]) });
        assert.strictEqual(res.status, 400);
        assert.strictEqual(calls.length, 0);
    }));

test('files returns metadata for the job and its SQL never selects content', () =>
    withServer(async (base) => {
        listRows = [{ id: 1, filename: 'a.pdf', mimetype: 'application/pdf', size: 2, uploaded_at: 'now' }];
        const res = await fetch(`${base}/files?jobId=7`);
        assert.strictEqual(res.status, 200);
        assert.deepStrictEqual(await res.json(), listRows);
        assert.deepStrictEqual(calls[0].params, ['7']);
        assert.doesNotMatch(calls[0].sql, /content|\*/);
    }));

test('files returns 400 when the job id is missing', () =>
    withServer(async (base) => {
        const res = await fetch(`${base}/files`);
        assert.strictEqual(res.status, 400);
        assert.strictEqual(calls.length, 0);
    }));
