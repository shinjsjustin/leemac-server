const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const jwt = require('jsonwebtoken');
const { start } = require('../helpers/server');

const KEY = process.env.BOURNE_READ_KEY;
const DOCS = fs.readFileSync(path.join(__dirname, '../../docs/bourne-api.md'), 'utf8');

async function withServer(fn) {
    const server = await start(require('../../src/app'));
    try { await fn(server.baseUrl); } finally { await server.close(); }
}

test('GET /api/bourne/docs with the key returns the markdown docs', async () => {
    await withServer(async (base) => {
        const res = await fetch(`${base}/api/bourne/docs`, { headers: { 'X-Bourne-Key': KEY } });
        assert.strictEqual(res.status, 200);
        assert.match(res.headers.get('content-type'), /^text\/markdown/);
        assert.strictEqual(await res.text(), DOCS);
    });
});

test('a valid JWT without the Bourne key is rejected on /api/bourne/docs', async () => {
    await withServer(async (base) => {
        const token = jwt.sign({ id: 1 }, process.env.JWT_SECRET);
        const res = await fetch(`${base}/api/bourne/docs`, { headers: { Authorization: `Bearer ${token}` } });
        assert.strictEqual(res.status, 401);
    });
});

test('the Bourne key without a JWT is rejected on /api/internal and /api/jarvis', async () => {
    await withServer(async (base) => {
        for (const p of ['/api/internal/job/getjobs', '/api/jarvis/anything']) {
            const res = await fetch(`${base}${p}`, { headers: { 'X-Bourne-Key': KEY } });
            assert.strictEqual(res.status, 401, p);
        }
    });
});

test('an unknown /api/bourne path with the key returns 404 JSON', async () => {
    await withServer(async (base) => {
        const res = await fetch(`${base}/api/bourne/nope`, { headers: { 'X-Bourne-Key': KEY } });
        assert.strictEqual(res.status, 404);
        assert.match(res.headers.get('content-type'), /application\/json/);
        assert.ok((await res.json()).error);
    });
});

test('a POST with the key returns 405', async () => {
    await withServer(async (base) => {
        const res = await fetch(`${base}/api/bourne/docs`, { method: 'POST', headers: { 'X-Bourne-Key': KEY } });
        assert.strictEqual(res.status, 405);
    });
});
