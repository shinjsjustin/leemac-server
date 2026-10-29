const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { start } = require('../helpers/server');
const contracts = require('../../src/client/src/api/contracts/adminDrawing.json');

const fileRow = { id: 9, filename: 'a.pdf', mimetype: 'application/pdf', size: 4, content: Buffer.from('%PDF') };
const fakeDb = { query: async () => [[fileRow]], execute: async () => [[]] };

const dbPath = require.resolve('../../src/db/db.js');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: fakeDb };

const partRouter = require('../../src/routes/part');

test('fetchAdminDrawingUrl request gets 2xx from the real part route', async () => {
    const { path, method } = contracts.fetchAdminDrawingUrl;
    const app = express();
    app.use('/internal/part', partRouter);
    const { baseUrl, close } = await start(app);
    try {
        const res = await fetch(`${baseUrl}${path}`, { method });
        assert.equal(res.status, 200);
        assert.equal(await res.text(), '%PDF');
    } finally {
        await close();
    }
});
