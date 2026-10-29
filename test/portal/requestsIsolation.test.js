const { test, mock } = require('node:test');
const assert = require('node:assert');
const { start } = require('../helpers/server');
const { SESSION_HANDLER, clientToken: signClientToken } = require('../helpers/session');

// Every lookup comes back empty, as it does for rows that belong to another company.
const calls = [];
const handle = async (sql, params) => {
    if (SESSION_HANDLER.match.test(sql)) return [SESSION_HANDLER.rows];
    calls.push({ sql, params });
    return [[]];
};
const conn = {
    execute: handle, query: handle,
    beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release: () => {},
};
const fakeDb = { execute: handle, query: handle, getConnection: async () => conn };
const dbPath = require.resolve('../../src/db/db.js');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: fakeDb };

const token = signClientToken({ id: 1, username: 'u', name: 'Pat', company_id: 5 });
const WRITE_SQL = /^\s*(INSERT|UPDATE|DELETE)\b/i;

function filesForm() {
    const form = new FormData();
    form.append('files', new Blob(['abc']), 'a.pdf');
    return form;
}

test("another company's request, line and file ids are 404 on every route with no writes", async () => {
    const info = mock.method(console, 'info', () => {});
    const server = await start(require('../../src/app'));
    try {
        const cases = [
            ['GET', '/77'],
            ['PUT', '/77', { name: 'x' }],
            ['POST', '/77/submit'],
            ['POST', '/77/files', filesForm()],
            ['POST', '/77/lines/88/files', filesForm()],
            ['DELETE', '/77/files/99'],
        ];
        for (const [method, path, payload] of cases) {
            calls.length = 0;
            const isForm = payload instanceof FormData;
            const res = await fetch(`${server.baseUrl}/api/portal-requests${path}`, {
                method,
                headers: { Authorization: `Bearer ${token}`, ...(payload && !isForm ? { 'Content-Type': 'application/json' } : {}) },
                body: payload ? (isForm ? payload : JSON.stringify(payload)) : undefined,
            });
            assert.strictEqual(res.status, 404, `${method} ${path}`);
            assert.ok(calls.length > 0, `${method} ${path} queried`);
            assert.deepStrictEqual(calls.filter((c) => WRITE_SQL.test(c.sql)), [], `${method} ${path} wrote`);
        }
    } finally {
        await server.close();
        info.mock.restore();
    }
});
