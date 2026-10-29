const { test, mock } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const { start } = require('../helpers/server');
const { makeNotesDb } = require('../helpers/notesSqliteDb');
const { SESSION_HANDLER, TEST_SID, adminToken: signAdminToken, clientToken: signClientToken } = require('../helpers/session');
const { signToken } = require('../../src/lib/auth');

const sessionDb = { execute: async () => [SESSION_HANDLER.rows], query: async () => [SESSION_HANDLER.rows] };
const dbPath = require.resolve('../../src/db/db.js');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: sessionDb };

const { createPortalNotesRouter } = require('../../src/routes/portalNotes');

const alice = signClientToken({ id: 1, username: 'a', name: 'Alice', company_id: 10 });
const bob = signClientToken({ id: 2, username: 'b', name: 'Bob', company_id: 10 });
const adminToken = signAdminToken({ id: 7, email: 'a@x.com', name: 'A', access_level: 3 });
const noCompany = signToken({ role: 'client', id: 3, name: 'C', sid: TEST_SID });

function seed() {
    const db = makeNotesDb();
    db.sqlite.exec(`
        INSERT INTO admin (id, name, email) VALUES (9, 'Portal', 'client-portal@leemac.invalid');
        INSERT INTO job (id, company_id) VALUES (1, 10), (2, 20);
        INSERT INTO part (id, number) VALUES (1, 'P-1'), (2, 'P-2');
        INSERT INTO job_part (job_id, part_id) VALUES (1, 1), (2, 2);
    `);
    return db;
}

async function withRouter(fn, db = seed()) {
    const app = express();
    app.use(express.json());
    app.use('/n', createPortalNotesRouter({ db, writeLimiter: (req, res, next) => next() }));
    const info = mock.method(console, 'info', () => {});
    const server = await start(app);
    const call = (method, path, { token, body } = {}) => fetch(`${server.baseUrl}/n${path}`, {
        method,
        headers: {
            ...(body ? { 'Content-Type': 'application/json' } : {}),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
    });
    try {
        await fn(call, db);
    } finally {
        await server.close();
        info.mock.restore();
    }
}

const ROUTES = [['GET', '/'], ['POST', '/'], ['PUT', '/3'], ['DELETE', '/3']];

test('every route is 401 anonymous and 403 for admin or a token without a company, touching no notes', async () => {
    await withRouter(async (call, db) => {
        const spy = mock.method(db, 'execute');
        for (const [method, path] of ROUTES) {
            for (const [token, status] of [[undefined, 401], [adminToken, 403], [noCompany, 403]]) {
                const res = await call(method, path, { token });
                assert.strictEqual(res.status, status, `${method} ${path}`);
            }
        }
        assert.strictEqual(spy.mock.calls.length, 0);
    });
});

test('create is 201 {id}, list shows it no-store, edit and delete return {ok: true}', async () => {
    await withRouter(async (call) => {
        const created = await call('POST', '/', { token: alice, body: { job_id: 1, content: 'hi' } });
        assert.strictEqual(created.status, 201);
        assert.deepStrictEqual(await created.json(), { id: 1 });

        const list = await call('GET', '/', { token: alice });
        assert.strictEqual(list.headers.get('cache-control'), 'no-store');
        const body = await list.json();
        assert.strictEqual(body.jobs[1][0].content, 'hi');
        assert.strictEqual(body.jobs[1][0].mine, true);

        const edited = await call('PUT', '/1', { token: alice, body: { content: 'yo' } });
        assert.strictEqual(edited.status, 200);
        assert.deepStrictEqual(await edited.json(), { ok: true });

        const removed = await call('DELETE', '/1', { token: alice });
        assert.deepStrictEqual(await removed.json(), { ok: true });
        assert.deepStrictEqual(await (await call('GET', '/', { token: alice })).json(), { jobs: {}, parts: {} });
    });
});

test('company comes only from the token, spoofed company_id is ignored', async () => {
    await withRouter(async (call, db) => {
        const res = await call('POST', '/?company_id=20', { token: alice, body: { job_id: 2, content: 'x', company_id: 20 } });
        assert.strictEqual(res.status, 404);
        const ok = await call('POST', '/?company_id=20', { token: alice, body: { part_id: 1, content: 'x', company_id: 20, client_id: 99 } });
        assert.strictEqual(ok.status, 201);
        const row = db.sqlite.prepare('SELECT company_id, client_id FROM note').get();
        assert.deepStrictEqual({ ...row }, { company_id: 10, client_id: 1 });
    });
});

test('another company job or part is 404 and creates nothing', async () => {
    await withRouter(async (call, db) => {
        for (const body of [{ job_id: 2, content: 'x' }, { part_id: 2, content: 'x' }, { job_id: 999, content: 'x' }]) {
            const res = await call('POST', '/', { token: alice, body });
            assert.strictEqual(res.status, 404, JSON.stringify(body));
        }
        assert.strictEqual(db.sqlite.prepare('SELECT COUNT(*) AS n FROM note').get().n, 0);
    });
});

test("editing or deleting another client's note is 404 and leaves it intact", async () => {
    await withRouter(async (call, db) => {
        await call('POST', '/', { token: alice, body: { job_id: 1, content: 'mine' } });
        assert.strictEqual((await call('PUT', '/1', { token: bob, body: { content: 'hax' } })).status, 404);
        assert.strictEqual((await call('DELETE', '/1', { token: bob })).status, 404);
        assert.strictEqual(db.sqlite.prepare('SELECT content FROM note').get().content, 'mine');
    });
});

test('validation errors keep status, bad ids and unknown paths are 404, unexpected errors are generic 500', async () => {
    await withRouter(async (call, db) => {
        assert.strictEqual((await call('POST', '/', { token: alice, body: { content: 'x' } })).status, 400);
        for (const path of ['/0', '/abc', '/01', '/12345678901']) {
            assert.strictEqual((await call('PUT', path, { token: alice, body: { content: 'x' } })).status, 404, path);
        }
        assert.strictEqual((await call('GET', '/1/nope', { token: alice })).status, 404);

        const err = mock.method(console, 'error', () => {});
        db.execute = async () => { throw new Error('boom: secret'); };
        const res = await call('GET', '/', { token: alice });
        err.mock.restore();
        assert.strictEqual(res.status, 500);
        assert.deepStrictEqual(await res.json(), { error: 'Internal Server Error' });
    });
});

test('the write limiter runs for non-GET only', async () => {
    let hits = 0;
    const app = express();
    app.use(express.json());
    app.use('/n', createPortalNotesRouter({ db: seed(), writeLimiter: (req, res, next) => { hits++; next(); } }));
    const info = mock.method(console, 'info', () => {});
    const server = await start(app);
    try {
        const headers = { Authorization: `Bearer ${alice}` };
        await fetch(`${server.baseUrl}/n/`, { headers });
        assert.strictEqual(hits, 0);
        await fetch(`${server.baseUrl}/n/3`, { method: 'DELETE', headers });
        assert.strictEqual(hits, 1);
    } finally {
        await server.close();
        info.mock.restore();
    }
});

test('the app mounts the router at /api/portal-notes', async () => {
    const info = mock.method(console, 'info', () => {});
    const server = await start(require('../../src/app'));
    try {
        const res = await fetch(`${server.baseUrl}/api/portal-notes/`);
        assert.strictEqual(res.status, 401);
        assert.deepStrictEqual(await res.json(), { message: 'Token is NULL' });
    } finally {
        await server.close();
        info.mock.restore();
    }
});
