const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { start } = require('../helpers/server');
const { makeFakeDb } = require('../helpers/fakeDb');

const WRITE_KEY = 'test-bourne-write-key';
const dbPath = require.resolve('../../src/db/db');
let server;
let savedWriteKey;

before(async () => {
    savedWriteKey = process.env.BOURNE_WRITE_KEY;
    process.env.BOURNE_WRITE_KEY = WRITE_KEY;
    require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: makeFakeDb() };
    server = await start(require('../../src/app'));
});

after(async () => {
    await server.close();
    delete require.cache[dbPath];
    if (savedWriteKey === undefined) delete process.env.BOURNE_WRITE_KEY;
    else process.env.BOURNE_WRITE_KEY = savedWriteKey;
});

const readKey = () => process.env.BOURNE_READ_KEY;
const post = (url, headers = {}) => fetch(`${server.baseUrl}${url}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: '{}',
});

test('write quote route rejects the read key with 401', async () => {
    const res = await post('/api/bourne/write/jobs/quote', { 'X-Bourne-Key': readKey() });
    assert.strictEqual(res.status, 401);
});

test('write quote route rejects a missing key with 401', async () => {
    const res = await post('/api/bourne/write/jobs/quote');
    assert.strictEqual(res.status, 401);
});

test('read router still 405s POST with the read key', async () => {
    const res = await post('/api/bourne/docs', { 'X-Bourne-Key': readKey() });
    assert.strictEqual(res.status, 405);
});

test('read router still serves GET /docs', async () => {
    const res = await fetch(`${server.baseUrl}/api/bourne/docs`, { headers: { 'X-Bourne-Key': readKey() } });
    assert.strictEqual(res.status, 200);
});

test('write router validates POST /write/jobs/quote body with the write key', async () => {
    const res = await post('/api/bourne/write/jobs/quote', { 'X-Bourne-Key': WRITE_KEY });
    assert.strictEqual(res.status, 400);
    assert.deepStrictEqual(await res.json(), { error: 'company_id is required' });
});

test('write router 405s GET /write/jobs/quote with Allow POST', async () => {
    const res = await fetch(`${server.baseUrl}/api/bourne/write/jobs/quote`, { headers: { 'X-Bourne-Key': WRITE_KEY } });
    assert.strictEqual(res.status, 405);
    assert.strictEqual(res.headers.get('allow'), 'POST');
});
