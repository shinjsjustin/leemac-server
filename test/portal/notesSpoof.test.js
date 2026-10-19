const { test } = require('node:test');
const assert = require('node:assert');
const { start } = require('../helpers/server');
const { signClientToken } = require('../../src/lib/auth');

const calls = [];
const fakeDb = {
    execute: async (sql, params) => {
        calls.push({ sql, params });
        if (/FROM job WHERE/.test(sql)) return [[{ id: 1 }]];
        if (/FROM admin WHERE email/.test(sql)) return [[{ id: 4 }]];
        if (/INSERT INTO note/.test(sql)) return [{ insertId: 11 }];
        return [[]];
    },
};
fakeDb.query = fakeDb.execute;

const dbPath = require.resolve('../../src/db/db.js');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: fakeDb };

const COMPANY = 5;
const token = signClientToken({ id: 1, username: 'u', name: 'Pat', company_id: COMPANY });

test('a spoofed note POST uses the token company, the portal admin and the path job', async () => {
    const server = await start(require('../../src/app'));
    try {
        const res = await fetch(`${server.baseUrl}/api/client/portal/jobs/1/notes?company_id=99`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ content: 'x', company_id: 99, companyId: 98 }),
        });
        assert.strictEqual(res.status, 201);
        assert.strictEqual(calls.length, 3);
        for (const c of calls) {
            assert.ok(!c.params.includes(99) && !c.params.includes(98), `no spoofed id in ${c.sql}`);
        }
        assert.deepStrictEqual(calls[0].params, [1, COMPANY]);
        assert.deepStrictEqual(calls[1].params, ['client-portal@leemac.invalid']);
        assert.match(calls[2].sql, /INSERT INTO note/);
        assert.deepStrictEqual(calls[2].params, ['Pat: x', 4, 1]);
    } finally {
        await server.close();
    }
});
