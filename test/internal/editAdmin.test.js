const { test } = require('node:test');
const assert = require('node:assert');
const { start } = require('../helpers/server');
const { signAdminToken } = require('../../src/lib/auth');

const fakeDb = { calls: [] };
const run = async (sql, params) => {
    fakeDb.calls.push({ sql, params });
    return [/^\s*UPDATE/i.test(sql) ? { affectedRows: 1 } : []];
};
fakeDb.query = run;
fakeDb.execute = run;

const dbPath = require.resolve('../../src/db/db.js');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: fakeDb };

const token = signAdminToken({ id: 7, email: 'a@x.com', name: 'A', access_level: 3 });

async function edit(server, body) {
    fakeDb.calls.length = 0;
    const res = await fetch(`${server.baseUrl}/api/internal/admins/editadmin`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
}
const updates = () => fakeDb.calls.filter((c) => /^\s*UPDATE/i.test(c.sql));

test('refuses changing own access level with 403 and runs no UPDATE', async () => {
    const server = await start(require('../../src/app'));
    try {
        for (const id of [7, '7']) {
            const res = await edit(server, { id, access_level: 3 });
            assert.strictEqual(res.status, 403);
            assert.deepStrictEqual(res.body, { error: 'Cannot change your own access level' });
            assert.strictEqual(updates().length, 0);
        }
    } finally {
        await server.close();
    }
});

test('allows own name change and another admin level change', async () => {
    const server = await start(require('../../src/app'));
    try {
        const own = await edit(server, { id: 7, name: 'New' });
        assert.strictEqual(own.status, 200);
        assert.strictEqual(updates().length, 1);

        const other = await edit(server, { id: 8, access_level: 3 });
        assert.strictEqual(other.status, 200);
        assert.strictEqual(updates().length, 1);
        assert.strictEqual(updates()[0].params[1], 3);
    } finally {
        await server.close();
    }
});
