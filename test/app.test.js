const { test } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const { start } = require('./helpers/server');
const { makeFakeDb } = require('./helpers/fakeDb');

test('requiring src/app.js does not listen', () => {
    let listenCalls = 0;
    const original = http.Server.prototype.listen;
    http.Server.prototype.listen = function (...args) {
        listenCalls += 1;
        return original.apply(this, args);
    };
    try {
        const app = require('../src/app');
        assert.strictEqual(typeof app, 'function');
        assert.strictEqual(typeof app.use, 'function');
        assert.strictEqual(listenCalls, 0);
    } finally {
        http.Server.prototype.listen = original;
    }
});

test('GET /api/internal/job/getjobs without a JWT returns 401', async () => {
    const server = await start(require('../src/app'));
    try {
        const res = await fetch(`${server.baseUrl}/api/internal/job/getjobs`);
        assert.strictEqual(res.status, 401);
    } finally {
        await server.close();
    }
});

test('fake db records SQL and returns rows from the first matching handler', async () => {
    const db = makeFakeDb([
        { match: /FROM stars/i, rows: [{ id: 1 }] },
        { match: /FROM/i, rows: [{ id: 2 }] },
    ]);
    const [starRows] = await db.execute('SELECT * FROM stars WHERE u = ?', [7]);
    const [noneRows] = await db.query('UPDATE x SET a = 1');
    assert.deepStrictEqual(starRows, [{ id: 1 }]);
    assert.deepStrictEqual(noneRows, []);
    assert.deepStrictEqual(db.calls, [
        { sql: 'SELECT * FROM stars WHERE u = ?', params: [7] },
        { sql: 'UPDATE x SET a = 1', params: undefined },
    ]);
});
