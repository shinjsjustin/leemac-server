const { test, mock } = require('node:test');
const assert = require('node:assert');
const { start } = require('../helpers/server');
const { SESSION_HANDLER, adminToken: signAdminToken, clientToken: signClientToken } = require('../helpers/session');

const fakeDb = { calls: [], handlers: [] };
fakeDb.execute = async (sql, params) => {
    if (SESSION_HANDLER.match.test(sql)) return [SESSION_HANDLER.rows];
    fakeDb.calls.push({ sql, params });
    const h = fakeDb.handlers.find((x) => x.match.test(sql));
    return [h ? h.rows : []];
};
fakeDb.query = fakeDb.execute;

const dbPath = require.resolve('../../src/db/db.js');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: fakeDb };

const COMPANY = 5;
const clientToken = signClientToken({ id: 1, username: 'u', name: 'Pat', company_id: COMPANY });
const adminToken = signAdminToken({ id: 7, email: 'a@x.com', name: 'A', access_level: 3 });

async function withServer(fn) {
    const info = mock.method(console, 'info', () => {});
    const server = await start(require('../../src/app'));
    try {
        await fn(server);
    } finally {
        await server.close();
        info.mock.restore();
    }
}

const get = (server, path, token) => fetch(`${server.baseUrl}/api/portal${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
});

test('GET /overview returns the five sections for the token company only', async () => {
    fakeDb.calls.length = 0;
    fakeDb.handlers = [
        { match: /COUNT\(\*\)/, rows: [{ total: 0 }] },
        { match: /FROM part_list WHERE/, rows: [{ id: 3, name: 'L' }] },
    ];
    await withServer(async (server) => {
        const res = await get(server, `/overview?company_id=99&limit=5`, clientToken);
        assert.strictEqual(res.status, 200);
        const body = await res.json();
        assert.deepStrictEqual(Object.keys(body).sort(), ['jobs', 'lists', 'pagination', 'parts', 'requests']);
        assert.strictEqual(body.lists[0].id, 3);
        assert.strictEqual(body.pagination.limit, 5);
    });
    assert.ok(fakeDb.calls.length > 0);
    for (const call of fakeDb.calls) {
        assert.ok(call.params.includes(COMPANY), call.sql);
        assert.ok(!call.params.includes('99') && !call.params.includes(99), call.sql);
    }
});

test('GET /overview is 401 anonymous and 403 for admin', async () => {
    await withServer(async (server) => {
        assert.strictEqual((await get(server, '/overview')).status, 401);
        assert.strictEqual((await get(server, '/overview', adminToken)).status, 403);
    });
});
