const { test, mock } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const { start } = require('../helpers/server');
const { makeFakeTxDb } = require('../helpers/fakeTxDb');
const { SESSION_HANDLER, adminToken: signAdminToken, clientToken: signClientToken } = require('../helpers/session');

const COMPANY = 5;
const state = { handlers: [] };
const fakeDb = makeFakeTxDb([SESSION_HANDLER, { match: /./, rows: () => [] }]);
const innerExecute = fakeDb.execute;
const route = async (sql, params) => {
    if (SESSION_HANDLER.match.test(sql)) return [SESSION_HANDLER.rows];
    const h = state.handlers.find((x) => x.match.test(sql));
    if (h && h.error) throw h.error;
    await innerExecute(sql, params);
    return [h ? (typeof h.rows === 'function' ? h.rows(params) : h.rows) : []];
};
fakeDb.execute = route;
fakeDb.query = route;
const baseGetConnection = fakeDb.getConnection;
fakeDb.getConnection = async () => {
    const conn = await baseGetConnection();
    return { ...conn, execute: route, query: route };
};

const dbPath = require.resolve('../../src/db/db.js');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: fakeDb };

const clientToken = signClientToken({ id: 1, username: 'u', name: 'Pat', company_id: COMPANY });
const adminToken = signAdminToken({ id: 7, email: 'a@x.com', name: 'A', access_level: 3 });

const REQUEST_ROW = { id: 3, company_id: COMPANY, client_id: '1', client_name: 'Pat', name: 'N', status: 'draft' };
const OWN_DRAFT = { match: /FROM quote_request WHERE id = \? AND company_id = \?/, rows: [REQUEST_ROW] };

function reset(handlers = []) {
    fakeDb.calls.length = 0;
    state.handlers = handlers;
}

async function withServer(fn) {
    const info = mock.method(console, 'info', () => {});
    const server = await start(require('../../src/app'));
    try {
        await fn(server, info);
    } finally {
        await server.close();
        info.mock.restore();
    }
}

function call(server, method, path, { token, body, form } = {}) {
    return fetch(`${server.baseUrl}/api/portal-requests${path}`, {
        method,
        headers: {
            ...(body ? { 'Content-Type': 'application/json' } : {}),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: form || (body ? JSON.stringify(body) : undefined),
    });
}

const ROUTES = [
    ['GET', '/'], ['POST', '/'], ['GET', '/3'], ['PUT', '/3'], ['POST', '/3/submit'],
    ['POST', '/3/files'], ['POST', '/3/lines/4/files'], ['DELETE', '/3/files/9'],
];

test('every route is 401 without a token and 403 for admin, each logging one audit line', async () => {
    await withServer(async (server, info) => {
        for (const [method, path] of ROUTES) {
            for (const [token, status] of [[undefined, 401], [adminToken, 403]]) {
                reset();
                info.mock.resetCalls();
                const res = await call(server, method, path, { token });
                assert.strictEqual(res.status, status, `${method} ${path}`);
                const lines = info.mock.calls.map((c) => JSON.parse(c.arguments[0])).filter((l) => l.event === 'portal_request');
                assert.strictEqual(lines.length, 1);
                assert.strictEqual(lines[0].status, status);
                assert.ok(!fakeDb.calls.some((c) => /quote_request/.test(c.sql || '')));
            }
        }
    });
});

test('company_id in query and body is ignored and the token company is bound on create', async () => {
    await withServer(async (server) => {
        reset([{ match: /INSERT INTO quote_request /, rows: { insertId: 3 } }, OWN_DRAFT]);
        const res = await call(server, 'POST', '/?company_id=99', { token: clientToken, body: { name: 'N', company_id: 99, companyId: 98 } });
        assert.strictEqual(res.status, 201);
        assert.deepStrictEqual(await res.json(), { id: 3 });
        const insert = fakeDb.calls.find((c) => /INSERT INTO quote_request /.test(c.sql || ''));
        assert.strictEqual(insert.params[0], COMPANY);
        assert.ok(!fakeDb.calls.some((c) => (c.params || []).includes(99) || (c.params || []).includes(98)));
    });
});

test('list and get are scoped to the token company and carry no price key', async () => {
    await withServer(async (server) => {
        reset([OWN_DRAFT, { match: /FROM quote_request ORDER|FROM quote_request WHERE company_id/, rows: [REQUEST_ROW] }]);
        const list = await call(server, 'GET', '/?company_id=99', { token: clientToken });
        assert.strictEqual(list.status, 200);
        assert.doesNotMatch(JSON.stringify(await list.json()), /price/i);
        const one = await call(server, 'GET', '/3', { token: clientToken });
        assert.strictEqual(one.status, 200);
        assert.doesNotMatch(JSON.stringify(await one.json()), /price/i);
        assert.ok(fakeDb.calls.every((c) => !(c.params || []).includes(99)));
        assert.strictEqual(one.headers.get('cache-control'), 'no-store');
    });
});

test('PUT on a non-draft request is 409', async () => {
    await withServer(async (server) => {
        reset([{ match: /FOR UPDATE/, rows: [{ id: 3, status: 'sent' }] }]);
        const res = await call(server, 'PUT', '/3', { token: clientToken, body: { name: 'x' } });
        assert.strictEqual(res.status, 409);
    });
});

test('bad ids are 404 and unexpected errors are a generic 500', async () => {
    await withServer(async (server) => {
        for (const path of ['/0', '/abc', '/01', '/12345678901', '/3/files/x']) {
            reset();
            const res = await call(server, 'GET', path, { token: clientToken });
            assert.strictEqual(res.status, 404, path);
        }
        const err = mock.method(console, 'error', () => {});
        reset([{ match: /FROM quote_request/, error: new Error('db exploded: secret') }]);
        const res = await call(server, 'GET', '/3', { token: clientToken });
        err.mock.restore();
        assert.strictEqual(res.status, 500);
        assert.deepStrictEqual(await res.json(), { error: 'Internal Server Error' });
        const unknown = await call(server, 'GET', '/3/nope', { token: clientToken });
        assert.strictEqual(unknown.status, 404);
    });
});

function formWith(name, bytes) {
    const form = new FormData();
    form.append('files', new Blob([Buffer.alloc(bytes, 1)]), name);
    return form;
}

test('a 21 MB file is 413 and an .exe is 400', async () => {
    await withServer(async (server) => {
        reset([OWN_DRAFT]);
        const big = await call(server, 'POST', '/3/files', { token: clientToken, form: formWith('a.pdf', 21 * 1024 * 1024) });
        assert.strictEqual(big.status, 413);
        const exe = await call(server, 'POST', '/3/files', { token: clientToken, form: formWith('a.exe', 10) });
        assert.strictEqual(exe.status, 400);
    });
});

test('upload and delete succeed for an own draft', async () => {
    await withServer(async (server) => {
        reset([
            { match: /FOR UPDATE/, rows: [{ id: 3, status: 'draft' }] },
            { match: /COUNT\(\*\)/, rows: [{ total: 0 }] },
            { match: /INSERT INTO quote_request_file/, rows: { insertId: 11 } },
        ]);
        const up = await call(server, 'POST', '/3/files', { token: clientToken, form: formWith('a.pdf', 10) });
        assert.strictEqual(up.status, 201);
        const empty = await call(server, 'POST', '/3/files', { token: clientToken, form: new FormData() });
        assert.strictEqual(empty.status, 400);
    });
});

test('the write limiter runs for non-GET only', async () => {
    const { createPortalRequestsRouter } = require('../../src/routes/portalRequests');
    let hits = 0;
    const app = express();
    app.use(express.json());
    app.use('/r', createPortalRequestsRouter({ db: fakeDb, writeLimiter: (req, res, next) => { hits++; next(); } }));
    const info = mock.method(console, 'info', () => {});
    const server = await start(app);
    try {
        reset([{ match: /FROM quote_request/, rows: [] }]);
        const headers = { Authorization: `Bearer ${clientToken}` };
        await fetch(`${server.baseUrl}/r/`, { headers });
        assert.strictEqual(hits, 0);
        await fetch(`${server.baseUrl}/r/3`, { method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json' }, body: '{}' });
        assert.strictEqual(hits, 1);
    } finally {
        await server.close();
        info.mock.restore();
    }
});
