const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const { start } = require('../helpers/server');
const { isBourneWrite, createWriteLimiter, bourneWriteLimiter } = require('../../src/middleware/isBourneWrite');

const READ = 'test-bourne-read-key';
const WRITE = 'test-bourne-write-key';
let saved;
beforeEach(() => { saved = process.env.BOURNE_WRITE_KEY; process.env.BOURNE_WRITE_KEY = WRITE; });
afterEach(() => {
    if (saved === undefined) delete process.env.BOURNE_WRITE_KEY;
    else process.env.BOURNE_WRITE_KEY = saved;
});

async function call(headers = {}) {
    const app = express();
    app.post('/w', isBourneWrite, (req, res) => res.json({ actor: req.bourneActor }));
    const s = await start(app);
    try {
        const res = await fetch(`${s.baseUrl}/w`, { method: 'POST', headers });
        return { status: res.status, body: await res.json() };
    } finally { await s.close(); }
}

test('returns 503 when write key is unset', async () => {
    delete process.env.BOURNE_WRITE_KEY;
    assert.strictEqual((await call({ 'X-Bourne-Key': WRITE })).status, 503);
});

test('returns 503 when write key equals read key', async () => {
    process.env.BOURNE_WRITE_KEY = READ;
    assert.strictEqual((await call({ 'X-Bourne-Key': READ })).status, 503);
});

test('returns 401 for missing, read and wrong keys', async () => {
    assert.strictEqual((await call()).status, 401);
    assert.strictEqual((await call({ 'X-Bourne-Key': READ })).status, 401);
    assert.strictEqual((await call({ 'X-Bourne-Key': 'nope' })).status, 401);
});

test('sets bourneActor and calls next on matching key', async () => {
    const r = await call({ 'X-Bourne-Key': WRITE });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.actor, 'bourne-write');
});

test('createWriteLimiter returns 429 JSON past max per minute', async () => {
    const app = express();
    app.use(createWriteLimiter({ max: 2 }));
    app.get('/', (req, res) => res.json({ ok: true }));
    const s = await start(app);
    try {
        assert.strictEqual((await fetch(s.baseUrl)).status, 200);
        assert.strictEqual((await fetch(s.baseUrl)).status, 200);
        const res = await fetch(s.baseUrl);
        assert.strictEqual(res.status, 429);
        assert.ok((await res.json()).error);
    } finally { await s.close(); }
});

test('bourneWriteLimiter allows 30 then limits', async () => {
    const app = express();
    app.use(bourneWriteLimiter);
    app.get('/', (req, res) => res.json({ ok: true }));
    const s = await start(app);
    try {
        for (let i = 0; i < 30; i++) assert.strictEqual((await fetch(s.baseUrl)).status, 200);
        assert.strictEqual((await fetch(s.baseUrl)).status, 429);
    } finally { await s.close(); }
});
