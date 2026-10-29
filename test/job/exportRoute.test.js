const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const { start } = require('../helpers/server');

const dbPath = require.resolve('../../src/db/db.js');
const fakeDb = { execute: async () => [[]] };
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: fakeDb };

const { createJobExportRouter } = require('../../src/routes/job/export');
const { QuoteExportError } = require('../../src/lib/quoteExport');

let user;
let calls;
let exportJobs;

beforeEach(() => {
    user = { role: 'admin', access: 3 };
    calls = [];
    exportJobs = async (db, id, types) => {
        calls.push({ db, id, types });
        return { results: [{ type: types[0] }], failed: null, skipped: [] };
    };
});

async function post(path, body) {
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => { req.user = user; next(); });
    app.use('/', createJobExportRouter({ db: fakeDb, exportJobs: (...a) => exportJobs(...a) }));
    const { baseUrl, close } = await start(app);
    try {
        const res = await fetch(baseUrl + path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        return { status: res.status, body: await res.json() };
    } finally {
        await close();
    }
}

for (const [name, u] of [
    ['a client', { role: 'client', company_id: 5 }],
    ['a level 2 admin', { role: 'admin', access: 2 }],
]) {
    test(`returns 403 for ${name} without calling exportJobs`, async () => {
        user = u;
        const res = await post('/export?id=7', { types: ['quote'] });
        assert.equal(res.status, 403);
        assert.equal(calls.length, 0);
    });
}

test('returns 200 with results for a level 3 admin and passes db, id and types', async () => {
    const res = await post('/export?id=7', { types: ['quote', 'order'] });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { results: [{ type: 'quote' }], skipped: [] });
    assert.deepEqual(calls, [{ db: fakeDb, id: '7', types: ['quote', 'order'] }]);
});

test('accepts a single type string', async () => {
    await post('/export?id=7', { type: 'invoice' });
    assert.deepEqual(calls[0].types, ['invoice']);
});

test('wraps a string types value in an array', async () => {
    await post('/export?id=7', { types: 'quote' });
    assert.deepEqual(calls[0].types, ['quote']);
});

test('returns 400 when id is missing', async () => {
    const res = await post('/export', { types: ['quote'] });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { error: 'Job ID is required' });
    assert.equal(calls.length, 0);
});

test('returns 400 for an unknown type', async () => {
    exportJobs = require('../../src/lib/quoteExport').exportJobs;
    const res = await post('/export?id=7', { types: ['bogus'] });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { error: 'Unknown export type' });
});

test('answers the failed status with error, failedType, results and skipped for a partial run', async () => {
    exportJobs = async () => ({
        results: [{ type: 'quote' }],
        failed: { type: 'order', status: 502, error: 'Script down' },
        skipped: ['invoice'],
    });
    const res = await post('/export?id=7', { types: ['quote', 'order', 'invoice'] });
    assert.equal(res.status, 502);
    assert.deepEqual(res.body, {
        error: 'Script down',
        failedType: 'order',
        results: [{ type: 'quote' }],
        skipped: ['invoice'],
    });
});

test('maps a QuoteExportError thrown up front to its status', async () => {
    exportJobs = async () => { throw new QuoteExportError(422, 'Nope'); };
    const res = await post('/export?id=7', { types: ['quote'] });
    assert.equal(res.status, 422);
    assert.deepEqual(res.body, { error: 'Nope' });
});

test('logs and answers 500 for an unexpected error', async () => {
    exportJobs = async () => { throw new Error('boom'); };
    const orig = console.error;
    console.error = () => {};
    try {
        const res = await post('/export?id=7', { types: ['quote'] });
        assert.equal(res.status, 500);
        assert.deepEqual(res.body, { error: 'Export failed' });
    } finally {
        console.error = orig;
    }
});
