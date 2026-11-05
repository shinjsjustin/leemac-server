const { test, mock } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { start } = require('../helpers/server');
const { makeSharedListsDb } = require('../helpers/sharedListsSqliteDb');
const { SESSION_HANDLER, adminToken: signAdminToken, clientToken: signClientToken } = require('../helpers/session');

const holder = { db: null };
const route = async (sql, params) => (SESSION_HANDLER.match.test(sql) ? [SESSION_HANDLER.rows] : holder.db.execute(sql, params));
const sessionDb = { execute: route, query: route, getConnection: () => holder.db.getConnection() };
const dbPath = require.resolve('../../src/db/db.js');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: sessionDb };

const { createPortalListsRouter } = require('../../src/routes/portalLists');

process.env.QUOTE_REQUEST_EMAIL = 'justin@x.com';
const TOKEN = 'A'.repeat(43);
const clientToken = signClientToken({ id: 11, username: 'ann', name: 'Ann', company_id: 1 });
const adminToken = signAdminToken({ id: 7, email: 'a@x.com', name: 'A', access_level: 3 });

function seed() {
    const db = makeSharedListsDb();
    db.sqlite.exec(`
      ALTER TABLE job ADD COLUMN created_at TEXT;
      ALTER TABLE job_part ADD COLUMN rev TEXT;
      ALTER TABLE job_part ADD COLUMN material TEXT;
      ALTER TABLE job_part ADD COLUMN finish TEXT;
      CREATE TABLE quote_request (id INTEGER PRIMARY KEY AUTOINCREMENT, company_id INTEGER, client_id TEXT, client_name TEXT,
        name TEXT, need_by TEXT, note TEXT, status TEXT, job_id INTEGER, created_at TEXT, updated_at TEXT,
        submitted_at TEXT, reviewed_at TEXT);
      CREATE TABLE quote_request_line (id INTEGER PRIMARY KEY AUTOINCREMENT, request_id INTEGER, position INTEGER,
        part_number TEXT, description TEXT, rev TEXT, material TEXT, finish TEXT, quantity INTEGER, source_part_id INTEGER);
      CREATE TABLE quote_request_file (id INTEGER PRIMARY KEY AUTOINCREMENT, request_id INTEGER, line_id INTEGER,
        filename TEXT, mimetype TEXT, size INTEGER);
      INSERT INTO job (id, company_id, job_number, created_at) VALUES (1,1,'J1','2026-01-01');
      INSERT INTO part (id, number, description) VALUES (1,'P1','Bracket'),(2,'P2','Plate');
      INSERT INTO job_part (job_id, part_id, details) VALUES (1,1,'*AL'),(1,2,'*AL');
      INSERT INTO admin_part_list (id, name, created_by_id, created_by_name, updated_by_id, updated_by_name, created_at, updated_at, share_token, share_enabled)
        VALUES (1,'Shared','1','Admin','1','Admin','t','t','${TOKEN}',1);
      INSERT INTO admin_part_list_item (list_id, part_id, added_at, added_by_company_id) VALUES (1,1,'t',1);
      INSERT INTO admin_part_list_member (list_id, company_id, joined_by_id, joined_by_name, joined_at) VALUES (1,1,'11','Ann','t');
    `);
    return db;
}

async function withServer(fn, send = async () => {}) {
    holder.db = seed();
    const app = express();
    app.use(express.json());
    app.use('/api/portal-lists', createPortalListsRouter({ db: holder.db, writeLimiter: (req, res, next) => next(), send }));
    const info = mock.method(console, 'info', () => {});
    const server = await start(app);
    try {
        await fn(server, info);
    } finally {
        await server.close();
        info.mock.restore();
    }
}

const call = (server, method, path, { token, body } = {}) =>
    fetch(`${server.baseUrl}/api/portal-lists/shared${path}`, {
        method,
        headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body ? JSON.stringify(body) : undefined,
    });

const ROUTES = [
    ['GET', '/'], ['GET', '/1'], ['PUT', '/1'], ['POST', '/1/parts'], ['POST', '/1/parts/remove'], ['POST', '/1/leave'],
    ['GET', '/1/request-lines'], ['POST', '/1/request'], ['POST', '/invite'], ['POST', '/invite/join'],
];

test('every route is 401 without a token and 403 for an admin, each logging one audit line', async () => {
    await withServer(async (server, info) => {
        for (const [method, path] of ROUTES) {
            for (const [token, status] of [[undefined, 401], [adminToken, 403]]) {
                info.mock.resetCalls();
                const res = await call(server, method, path, { token, body: method === 'GET' ? undefined : { token: TOKEN } });
                assert.equal(res.status, status, `${method} ${path}`);
                const lines = info.mock.calls.map((c) => JSON.parse(c.arguments[0])).filter((l) => l.event === 'portal_request');
                assert.equal(lines.length, 1);
                assert.equal(lines[0].status, status);
            }
        }
    });
});

test('bad list ids and bad or unknown tokens are 404', async () => {
    await withServer(async (server) => {
        for (const path of ['/0', '/abc', '/01', '/12345678901', '/2', '/1/nope']) {
            const res = await call(server, 'GET', path, { token: clientToken });
            assert.equal(res.status, 404, path);
        }
        for (const path of ['/invite', '/invite/join']) {
            for (const bad of [undefined, 5, '', 'short', 'A'.repeat(44), `${'A'.repeat(42)}!`, 'B'.repeat(43)]) {
                const res = await call(server, 'POST', path, { token: clientToken, body: { token: bad } });
                assert.equal(res.status, 404, `${path} ${bad}`);
            }
        }
    });
});

test('invite shows the list and join makes the company a member', async () => {
    await withServer(async (server) => {
        const other = signClientToken({ id: 22, username: 'bob', name: 'Bob', company_id: 2 });
        assert.equal((await call(server, 'GET', '/1', { token: other })).status, 404);
        const invite = await call(server, 'POST', '/invite', { token: other, body: { token: TOKEN } });
        assert.equal(invite.status, 200);
        assert.equal((await invite.json()).joined, false);
        const joined = await call(server, 'POST', '/invite/join', { token: other, body: { token: TOKEN } });
        assert.equal(joined.status, 200);
        assert.equal((await joined.json()).joined, true);
        assert.equal((await call(server, 'GET', '/1', { token: other })).status, 200);
    });
});

test('no audit log line contains the share token', async () => {
    await withServer(async (server, info) => {
        const other = signClientToken({ id: 22, username: 'bob', name: 'Bob', company_id: 2 });
        for (const path of ['/invite', '/invite/join']) {
            await call(server, 'POST', path, { token: other, body: { token: TOKEN } });
        }
        await new Promise((resolve) => setImmediate(resolve));
        assert.equal(info.mock.calls.length, 2);
        for (const c of info.mock.calls) assert.ok(!String(c.arguments[0]).includes(TOKEN));
    });
});

test('list, rename, add, remove and leave keep their status and body', async () => {
    await withServer(async (server) => {
        const list = await call(server, 'GET', '/', { token: clientToken });
        assert.equal(list.status, 200);
        assert.equal(list.headers.get('cache-control'), 'no-store');
        assert.equal((await list.json())[0].name, 'Shared');

        const renamed = await call(server, 'PUT', '/1', { token: clientToken, body: { name: 'New' } });
        assert.equal((await renamed.json()).name, 'New');
        assert.equal((await call(server, 'PUT', '/1', { token: clientToken, body: { name: ' ' } })).status, 400);

        const added = await call(server, 'POST', '/1/parts', { token: clientToken, body: { part_ids: [2] } });
        assert.deepEqual((await added.json()).parts.map((p) => p.part_id), [1, 2]);
        const removed = await call(server, 'POST', '/1/parts/remove', { token: clientToken, body: { part_ids: [2] } });
        assert.deepEqual((await removed.json()).parts.map((p) => p.part_id), [1]);

        const left = await call(server, 'POST', '/1/leave', { token: clientToken });
        assert.deepEqual(await left.json(), { ok: true });
        assert.equal((await call(server, 'GET', '/1', { token: clientToken })).status, 404);
        assert.equal((await call(server, 'POST', '/1/leave', { token: clientToken })).status, 404);
    });
});

test('request-lines and request answer, and the request sends one email', async () => {
    const sent = [];
    const err = mock.method(console, 'error', () => {});
    await withServer(async (server) => {
        const lines = await call(server, 'GET', '/1/request-lines', { token: clientToken });
        assert.deepEqual((await lines.json()).map((l) => l.part_number), ['P1']);

        const body = { lines: [{ part_id: 1, quantity: 2 }] };
        const res = await call(server, 'POST', '/1/request', { token: clientToken, body });
        assert.equal(res.status, 201);
        assert.equal((await res.json()).lines[0].part_number, 'P1');
        assert.equal(sent.length, 1);

        const stale = await call(server, 'POST', '/1/request', { token: clientToken, body: { lines: [{ part_id: 2, quantity: 1 }] } });
        assert.equal(stale.status, 409);
        assert.equal(sent.length, 1);
    }, async (m) => { sent.push(m); });
    err.mock.restore();
});

test('a send that rejects is logged and the request is still 201', async () => {
    const err = mock.method(console, 'error', () => {});
    await withServer(async (server) => {
        const res = await call(server, 'POST', '/1/request', { token: clientToken, body: { lines: [{ part_id: 1, quantity: 2 }] } });
        assert.equal(res.status, 201);
        assert.ok(err.mock.calls.length >= 1);
    }, async () => { throw new Error('smtp down'); });
    err.mock.restore();
});

test('an unexpected error is a generic 500', async () => {
    const err = mock.method(console, 'error', () => {});
    await withServer(async (server) => {
        holder.db.execute = async () => { throw new Error('db exploded: secret'); };
        const res = await call(server, 'GET', '/', { token: clientToken });
        assert.equal(res.status, 500);
        assert.deepEqual(await res.json(), { error: 'Internal Server Error' });
    });
    err.mock.restore();
});
