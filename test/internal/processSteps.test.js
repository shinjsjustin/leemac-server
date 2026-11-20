const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const { start } = require('../helpers/server');
const { makeShopDb } = require('../helpers/shopSqliteDb');
const { SESSION_HANDLER, adminToken: signAdminToken } = require('../helpers/session');

const db = makeShopDb();
const shopExecute = db.execute;
db.execute = async (sql, params) => (SESSION_HANDLER.match.test(sql) ? [SESSION_HANDLER.rows] : shopExecute(sql, params));
db.query = db.execute;

const dbPath = require.resolve('../../src/db/db.js');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: db };

const adminToken = signAdminToken({ id: 7, email: 'a@x.com', name: 'A', access_level: 3 });

beforeEach(() => {
    db.sqlite.exec(`DELETE FROM part; INSERT INTO part (id, number) VALUES (5, 'P-5');`);
});

async function call(server, method, path, body) {
    const res = await fetch(`${server.baseUrl}/api/internal/part${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
}

async function withServer(fn) {
    const server = await start(require('../../src/app'));
    try {
        await fn(server);
    } finally {
        await server.close();
    }
}

const readSteps = async (server) => (await call(server, 'GET', '/getpart?id=5')).body.process_steps;

test('saves steps with line breaks kept and getpart reads them back', () =>
    withServer(async (server) => {
        const res = await call(server, 'PUT', '/processsteps', { id: 5, process_steps: '1. Saw\n2. Mill' });
        assert.strictEqual(res.status, 200);
        assert.strictEqual(await readSteps(server), '1. Saw\n2. Mill');
    }));

test('a blank string or null saves NULL', () =>
    withServer(async (server) => {
        for (const blank of ['   \n', null, '']) {
            await call(server, 'PUT', '/processsteps', { id: 5, process_steps: 'x' });
            assert.strictEqual((await call(server, 'PUT', '/processsteps', { id: 5, process_steps: blank })).status, 200);
            assert.strictEqual(await readSteps(server), null);
        }
    }));

test('accepts exactly 5000 characters and rejects 5001', () =>
    withServer(async (server) => {
        assert.strictEqual((await call(server, 'PUT', '/processsteps', { id: 5, process_steps: 'a'.repeat(5000) })).status, 200);
        assert.strictEqual((await call(server, 'PUT', '/processsteps', { id: 5, process_steps: 'a'.repeat(5001) })).status, 400);
        assert.strictEqual((await readSteps(server)).length, 5000);
    }));

test('a non-string is 400 and changes nothing', () =>
    withServer(async (server) => {
        await call(server, 'PUT', '/processsteps', { id: 5, process_steps: 'keep' });
        for (const bad of [42, ['a'], { a: 1 }, true]) {
            assert.strictEqual((await call(server, 'PUT', '/processsteps', { id: 5, process_steps: bad })).status, 400);
        }
        assert.strictEqual(await readSteps(server), 'keep');
    }));

test('an unknown part is 404', () =>
    withServer(async (server) => {
        assert.strictEqual((await call(server, 'PUT', '/processsteps', { id: 99, process_steps: 'x' })).status, 404);
    }));
