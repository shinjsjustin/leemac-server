const { test } = require('node:test');
const assert = require('node:assert');
const { start } = require('../helpers/server');
const { makeFakeDb } = require('../helpers/fakeDb');

const dbPath = require.resolve('../../src/db/db.js');
require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: makeFakeDb(),
};

const AUTH_LIMIT = 10;

test('google-login returns 429 with a JSON error after 10 requests from one client', async () => {
    const server = await start(require('../../src/app'));
    try {
        const post = () =>
            fetch(`${server.baseUrl}/api/admin/google-login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ googleId: 'x' }),
            });
        for (let i = 0; i < AUTH_LIMIT; i += 1) {
            assert.strictEqual((await post()).status, 404);
        }
        const limited = await post();
        assert.strictEqual(limited.status, 429);
        const body = await limited.json();
        assert.ok(body.error);
    } finally {
        await server.close();
    }
});
