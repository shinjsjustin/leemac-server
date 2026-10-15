const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
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

test('app mounts the write router before the read router', () => {
    const src = fs.readFileSync(path.join(__dirname, '../../src/app.js'), 'utf8');
    const write = src.indexOf("'/api/bourne/write'");
    const read = src.indexOf("'/api/bourne',");
    assert.ok(write !== -1 && read !== -1);
    assert.ok(write < read);
});
