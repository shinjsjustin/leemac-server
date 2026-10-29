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

const LIST_ROW = { id: 3, name: 'L', created_by_name: 'Pat', updated_by_name: 'Pat' };
const REQUEST_ROW = { id: 9, company_id: COMPANY, client_id: '1', client_name: 'Pat', name: 'L', status: 'sent' };
const REQUEST_FLOW = [
    { match: /SELECT id, name FROM part_list/, rows: [{ id: 3, name: 'L' }] },
    { match: /FROM part_list_item/, rows: [{ part_id: 4, part_number: 'A-1', description: 'd' }] },
    { match: /INSERT INTO quote_request /, rows: { insertId: 9 } },
    { match: /FROM quote_request WHERE id = \? AND company_id = \?/, rows: [REQUEST_ROW] },
    { match: /FROM quote_request_line/, rows: [{ id: 1, position: 0, part_number: 'A-1', quantity: 2 }] },
];
const REQUEST_BODY = { lines: [{ part_id: 4, quantity: 2 }] };

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

function call(server, method, path, { token, body } = {}, prefix = '/api/portal-lists') {
    return fetch(`${server.baseUrl}${prefix}${path}`, {
        method,
        headers: {
            ...(body ? { 'Content-Type': 'application/json' } : {}),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
    });
}

const ROUTES = [
    ['GET', '/'], ['POST', '/'], ['PUT', '/3'], ['DELETE', '/3'], ['POST', '/3/parts'],
    ['POST', '/3/parts/remove'], ['GET', '/3/request-lines'], ['POST', '/3/request'],
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
                assert.ok(!fakeDb.calls.some((c) => /part_list|quote_request/.test(c.sql || '')));
            }
        }
    });
});

test('list is scoped to the token company and no-store, create is 201 with the id', async () => {
    await withServer(async (server) => {
        reset([{ match: /FROM part_list WHERE company_id/, rows: [LIST_ROW] }]);
        const list = await call(server, 'GET', '/?company_id=99', { token: clientToken });
        assert.strictEqual(list.status, 200);
        assert.strictEqual(list.headers.get('cache-control'), 'no-store');
        assert.ok(fakeDb.calls.every((c) => !(c.params || []).includes(99)));

        reset([
            { match: /COUNT\(\*\)/, rows: [{ n: 0 }] },
            { match: /INSERT INTO part_list /, rows: { insertId: 3 } },
            { match: /FROM part_list WHERE id = \? AND company_id = \?/, rows: [LIST_ROW] },
        ]);
        const created = await call(server, 'POST', '/', { token: clientToken, body: { name: 'L', company_id: 99 } });
        assert.strictEqual(created.status, 201);
        assert.deepStrictEqual(await created.json(), { id: 3 });
        const insert = fakeDb.calls.find((c) => /INSERT INTO part_list /.test(c.sql || ''));
        assert.strictEqual(insert.params[0], COMPANY);
    });
});

test('PartListError keeps its status and bad ids are 404', async () => {
    await withServer(async (server) => {
        reset();
        const blank = await call(server, 'POST', '/', { token: clientToken, body: { name: ' ' } });
        assert.strictEqual(blank.status, 400);
        for (const path of ['/0/request-lines', '/abc', '/01', '/12345678901']) {
            reset();
            const res = await call(server, 'PUT', path, { token: clientToken, body: { name: 'x' } });
            assert.strictEqual(res.status, 404, path);
        }
        const unknown = await call(server, 'GET', '/3/nope', { token: clientToken });
        assert.strictEqual(unknown.status, 404);
    });
});

test('unexpected errors are a generic 500', async () => {
    await withServer(async (server) => {
        const err = mock.method(console, 'error', () => {});
        reset([{ match: /FROM part_list/, error: new Error('db exploded: secret') }]);
        const res = await call(server, 'GET', '/', { token: clientToken });
        err.mock.restore();
        assert.strictEqual(res.status, 500);
        assert.deepStrictEqual(await res.json(), { error: 'Internal Server Error' });
    });
});

test('the write limiter runs for non-GET only', async () => {
    const { createPortalListsRouter } = require('../../src/routes/portalLists');
    let hits = 0;
    const app = express();
    app.use(express.json());
    app.use('/r', createPortalListsRouter({ db: fakeDb, writeLimiter: (req, res, next) => { hits++; next(); } }));
    const info = mock.method(console, 'info', () => {});
    const server = await start(app);
    try {
        reset();
        const headers = { Authorization: `Bearer ${clientToken}` };
        await fetch(`${server.baseUrl}/r/`, { headers });
        assert.strictEqual(hits, 0);
        await fetch(`${server.baseUrl}/r/3`, { method: 'DELETE', headers });
        assert.strictEqual(hits, 1);
    } finally {
        await server.close();
        info.mock.restore();
    }
});

async function requestWith(send, fn, body = REQUEST_BODY) {
    const { createPortalListsRouter } = require('../../src/routes/portalLists');
    const app = express();
    app.use(express.json());
    app.use('/r', createPortalListsRouter({ db: fakeDb, writeLimiter: (req, res, next) => next(), send }));
    const info = mock.method(console, 'info', () => {});
    const server = await start(app);
    const saved = process.env.QUOTE_REQUEST_EMAIL;
    process.env.QUOTE_REQUEST_EMAIL = 'justin@x.com';
    try {
        reset(REQUEST_FLOW);
        await fn(() => call(server, 'POST', '/3/request', { token: clientToken, body }, '/r'));
    } finally {
        if (saved === undefined) delete process.env.QUOTE_REQUEST_EMAIL; else process.env.QUOTE_REQUEST_EMAIL = saved;
        await server.close();
        info.mock.restore();
    }
}

test('POST /:id/request is 201 with the request and sends one email to QUOTE_REQUEST_EMAIL', async () => {
    const sent = [];
    await requestWith(async (m) => { sent.push(m); }, async (submit) => {
        const res = await submit();
        assert.strictEqual(res.status, 201);
        assert.strictEqual((await res.json()).id, 9);
    });
    assert.strictEqual(sent.length, 1);
    assert.strictEqual(sent[0].to, 'justin@x.com');
    assert.match(sent[0].subject, /^Quote request: L from Pat$/);
});

test('a send that rejects is logged and the request is still 201', async () => {
    const err = mock.method(console, 'error', () => {});
    try {
        await requestWith(async () => { throw new Error('smtp down'); }, async (submit) => {
            assert.strictEqual((await submit()).status, 201);
        });
        assert.ok(err.mock.calls.length >= 1);
    } finally {
        err.mock.restore();
    }
});

test('a QuoteRequestError sends nothing and keeps its status', async () => {
    const sent = [];
    await requestWith(async (m) => { sent.push(m); }, async (submit) => {
        assert.strictEqual((await submit()).status, 400);
    }, { lines: [{ part_id: 4 }] });
    assert.strictEqual(sent.length, 0);
});
