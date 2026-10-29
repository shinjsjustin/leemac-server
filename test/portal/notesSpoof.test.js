const { test } = require('node:test');
const assert = require('node:assert');
const { start } = require('../helpers/server');
const { SESSION_HANDLER, clientToken: signClientToken } = require('../helpers/session');

const calls = [];
const fakeDb = {
    execute: async (sql, params) => {
        if (SESSION_HANDLER.match.test(sql)) return [SESSION_HANDLER.rows];
        calls.push({ sql, params });
        return [[]];
    },
};
fakeDb.query = fakeDb.execute;

const dbPath = require.resolve('../../src/db/db.js');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: fakeDb };

const token = signClientToken({ id: 1, username: 'u', name: 'Pat', company_id: 5 });

test('a spoofed note POST gets 410 and never touches note', async () => {
    const server = await start(require('../../src/app'));
    try {
        const res = await fetch(`${server.baseUrl}/api/client/portal/jobs/1/notes?company_id=99`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ content: 'x', company_id: 99, companyId: 98 }),
        });
        assert.strictEqual(res.status, 410);
        assert.ok(!calls.some((c) => /note/i.test(c.sql)));
        assert.strictEqual(calls.length, 0);
    } finally {
        await server.close();
    }
});
