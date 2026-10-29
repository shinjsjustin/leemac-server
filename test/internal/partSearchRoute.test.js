const { test } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const { start } = require('../helpers/server');
const { makeSqliteDb } = require('../helpers/sqliteDb');

const db = makeSqliteDb();
const dbPath = require.resolve('../../src/db/db.js');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: db };
const partRouter = require('../../src/routes/part');

async function get(query) {
    const app = express();
    app.use('/part', partRouter);
    const server = await start(app);
    try {
        const res = await fetch(`${server.baseUrl}/part/searchparts${query}`);
        return { status: res.status, body: await res.json() };
    } finally { await server.close(); }
}

test('GET /searchparts returns grouped parts with history', async () => {
    await db.execute("INSERT INTO part (number, description) VALUES ('ABC123', 'Bracket')");
    await db.execute("INSERT INTO job (job_number, created_at) VALUES ('100', '2024-01-01')");
    await db.execute('INSERT INTO job_part (job_id, part_id, price, quantity, rev, details) VALUES (1, 1, 5, 10, ?, ?)', ['A', 'd']);
    const res = await get('?searchTerm=abc');
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.body, [{
        id: 1, number: 'ABC123', description: 'Bracket',
        history: [{ price: 5, quantity: 10, rev: 'A', details: 'd', job_number: '100', created_at: '2024-01-01' }],
    }]);
});

test('GET /searchparts is 400 for a blank term', async () => {
    const res = await get('?searchTerm=');
    assert.strictEqual(res.status, 400);
    assert.deepStrictEqual(res.body, { error: 'Search term is required' });
});
