const { test } = require('node:test');
const assert = require('node:assert');
const { start } = require('../helpers/server');
const { makeFakeDb } = require('../helpers/fakeDb');
const express = require('express');

const KEY = process.env.BOURNE_READ_KEY;

async function get(db, headers = { 'X-Bourne-Key': KEY }) {
    const { createBourneRouter } = require('../../src/routes/bourne');
    const app = express();
    app.use('/api/bourne', createBourneRouter({ db }));
    const server = await start(app);
    try {
        const res = await fetch(`${server.baseUrl}/api/bourne/vendors`, { headers });
        return { status: res.status, type: res.headers.get('content-type'), body: await res.json() };
    } finally { await server.close(); }
}

test('returns vendors with name, expenses and last_used, merging spellings', async () => {
    const db = makeFakeDb([{
        match: /FROM expense/,
        rows: [
            { vendor: 'McMaster-Carr', expenses: 3, last_used: '2026-05-01' },
            { vendor: 'Acme Steel', expenses: 2, last_used: '2026-04-01' },
        ],
    }]);
    const { status, body } = await get(db);
    assert.strictEqual(status, 200);
    assert.deepStrictEqual(body, {
        vendors: [
            { name: 'Acme Steel', expenses: 2, last_used: '2026-04-01' },
            { name: 'McMaster-Carr', expenses: 3, last_used: '2026-05-01' },
        ],
    });
});

test('missing key returns 401 and runs no query', async () => {
    const db = makeFakeDb();
    const { status } = await get(db, {});
    assert.strictEqual(status, 401);
    assert.strictEqual(db.calls.length, 0);
});

test('a db error returns 500 with a JSON error', async () => {
    const db = { execute: async () => { throw new Error('boom'); } };
    const { status, type, body } = await get(db);
    assert.strictEqual(status, 500);
    assert.match(type, /application\/json/);
    assert.strictEqual(typeof body.error, 'string');
});
