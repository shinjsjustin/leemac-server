const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const { start } = require('../helpers/server');
const { makeFakeTxDb } = require('../helpers/fakeTxDb');
const { createBourneWriteRouter } = require('../../src/routes/bourne/write');

const KEY = 'test-bourne-write-key';
const wait = () => new Promise((r) => setTimeout(r, 50));
let saved;
beforeEach(() => { saved = process.env.BOURNE_WRITE_KEY; process.env.BOURNE_WRITE_KEY = KEY; });
afterEach(() => {
    if (saved === undefined) delete process.env.BOURNE_WRITE_KEY;
    else process.env.BOURNE_WRITE_KEY = saved;
});

async function post(path, body) {
    const db = makeFakeTxDb([[{ id: 3 }]]);
    const app = express();
    app.use(express.json());
    app.use('/w', createBourneWriteRouter({ db }));
    const s = await start(app);
    try {
        const res = await fetch(`${s.baseUrl}/w${path}`, {
            method: 'POST',
            headers: { 'X-Bourne-Key': KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        const json = await res.json();
        await wait();
        return { status: res.status, json };
    } finally { await s.close(); }
}

const cases = [
    { path: '/jobs/3/export', body: { type: 'quote' } },
    { path: '/jobs/3/export-quote', body: {} },
];

for (const { path, body } of cases) {
    test(`POST ${path} replies 404 JSON now that Bourne export is gone`, async () => {
        const r = await post(path, body);
        assert.strictEqual(r.status, 404);
        assert.deepStrictEqual(r.json, { error: 'Not found' });
    });
}
