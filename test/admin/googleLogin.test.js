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

const CALLS_PAST_AUTH_LIMIT = 12;

test('google-login returns 404 on every call because the route is gone, not rate-limited', async () => {
    const server = await start(require('../../src/app'));
    try {
        for (let i = 0; i < CALLS_PAST_AUTH_LIMIT; i += 1) {
            const res = await fetch(`${server.baseUrl}/api/admin/google-login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ googleId: 'x' }),
            });
            assert.strictEqual(res.status, 404);
        }
    } finally {
        await server.close();
    }
});
