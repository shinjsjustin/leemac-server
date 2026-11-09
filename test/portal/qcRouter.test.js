const { test, mock } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { start } = require('../helpers/server');
const { makeQcDb } = require('../helpers/qcSqliteDb');
const { SESSION_HANDLER, adminToken: signAdminToken, clientToken: signClientToken } = require('../helpers/session');

const sessionDb = { execute: async () => [SESSION_HANDLER.rows], query: async () => [SESSION_HANDLER.rows] };
const dbPath = require.resolve('../../src/db/db.js');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: sessionDb };

const { createPortalQcRouter } = require('../../src/routes/portalQc');

const COMPANY = 10;
const PHOTO_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const alice = signClientToken({ id: 1, username: 'a', name: 'Alice', company_id: COMPANY });
const adminToken = signAdminToken({ id: 7, email: 'a@x.com', name: 'A', access_level: 3 });

const POINT = { file_id: 1, page: 1, kind: 'point', x1: 0.5, y1: 0.5, size: 10, note: 'hole' };

// Part 1 belongs to company 10 and has drawing 1. Marking 1 is Leemac's (company NULL), marking 2 is Alice's.
function seedAll() {
    const db = makeQcDb();
    db.sqlite.exec(`
        INSERT INTO job (id, company_id, job_number) VALUES (1, 10, 'J-1');
        INSERT INTO part (id, number) VALUES (1, 'P-1');
        INSERT INTO job_part (job_id, part_id, quantity) VALUES (1, 1, 5);
        INSERT INTO uploaded_files (id, filename, part_id) VALUES (1, 'a.pdf', 1);
        INSERT INTO qc_marking (id, part_id, file_id, page, company_id, kind, x1, y1, size, author_id, author_name, created_at, updated_at)
            VALUES (1, 1, 1, 1, NULL, 'point', 0.1, 0.1, 5, '9', 'Leemac', 'now', 'now'),
                   (2, 1, 1, 1, 10, 'point', 0.2, 0.2, 5, '1', 'Alice', 'now', 'now');
    `);
    db.sqlite.prepare(
        "INSERT INTO qc_photo (id, marking_id, job_id, position, value, mimetype, size, content) VALUES (1, 1, 1, 1, '5.01', 'image/jpeg', ?, ?)"
    ).run(PHOTO_BYTES.length, PHOTO_BYTES);
    return db;
}

async function withRouter(fn, db = seedAll()) {
    const app = express();
    app.use(express.json());
    app.use('/q', createPortalQcRouter({ db, writeLimiter: (req, res, next) => next() }));
    const info = mock.method(console, 'info', () => {});
    const server = await start(app);
    const call = (method, path, { token = alice, body } = {}) => fetch(`${server.baseUrl}/q${path}`, {
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

const count = (db, sql) => db.sqlite.prepare(sql).get().n;

test('GET /parts/:id returns visible markings and photos grouped by job', () => withRouter(async (call) => {
    const res = await call('GET', '/parts/1');
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body.markings.map((m) => [m.id, m.is_leemac, m.mine]), [[1, true, false], [2, false, true]]);
    assert.equal(body.photos.length, 1);
    assert.equal(body.photos[0].job_number, 'J-1');
    assert.deepEqual(body.photos[0].photos.map((p) => p.id), [1]);
    assert.equal('content' in body.photos[0].photos[0], false);
}));

test('responses are no-store and nosniff', () => withRouter(async (call) => {
    const res = await call('GET', '/parts/1');
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
}));

test('POST /parts/:id/markings creates a marking and answers 201 { id }', () => withRouter(async (call, db) => {
    const res = await call('POST', '/parts/1/markings', { body: POINT });
    assert.equal(res.status, 201);
    const { id } = await res.json();
    const row = db.sqlite.prepare('SELECT company_id, author_name FROM qc_marking WHERE id = ?').get(id);
    assert.deepEqual({ ...row }, { company_id: COMPANY, author_name: 'Alice' });
}));

test('POST /parts/:id/markings answers 400 on an invalid kind and creates nothing', () => withRouter(async (call, db) => {
    const res = await call('POST', '/parts/1/markings', { body: { ...POINT, kind: 'circle' } });
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: 'kind must be point, line or box' });
    assert.equal(count(db, 'SELECT COUNT(*) AS n FROM qc_marking'), 2);
}));

test('PUT /markings/:id updates the clients own marking', () => withRouter(async (call, db) => {
    const res = await call('PUT', '/markings/2', { body: { ...POINT, note: 'moved', x1: 0.9 } });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
    const row = db.sqlite.prepare('SELECT note, x1 FROM qc_marking WHERE id = 2').get();
    assert.deepEqual({ ...row }, { note: 'moved', x1: 0.9 });
}));

test('PUT /markings/:id answers 400 on a bad payload and leaves the marking alone', () => withRouter(async (call, db) => {
    const res = await call('PUT', '/markings/2', { body: { ...POINT, x1: 2 } });
    assert.equal(res.status, 400);
    assert.equal(db.sqlite.prepare('SELECT x1 FROM qc_marking WHERE id = 2').get().x1, 0.2);
}));

test("PUT and DELETE /markings/:id answer 404 on Leemac's marking and change nothing", () => withRouter(async (call, db) => {
    const put = await call('PUT', '/markings/1', { body: POINT });
    const del = await call('DELETE', '/markings/1');
    assert.equal(put.status, 404);
    assert.equal(del.status, 404);
    assert.equal(count(db, 'SELECT COUNT(*) AS n FROM qc_marking WHERE id = 1'), 1);
}));

test('DELETE /markings/:id removes the marking and its photos', () => withRouter(async (call, db) => {
    db.sqlite.prepare(
        "INSERT INTO qc_photo (marking_id, job_id, position, mimetype, size) VALUES (2, 1, 1, 'image/png', 1)"
    ).run();
    const res = await call('DELETE', '/markings/2');
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
    assert.equal(count(db, 'SELECT COUNT(*) AS n FROM qc_marking WHERE id = 2'), 0);
    assert.equal(count(db, 'SELECT COUNT(*) AS n FROM qc_photo WHERE marking_id = 2'), 0);
}));

test("DELETE /parts/:id/markings clears the clients markings only", () => withRouter(async (call, db) => {
    const res = await call('DELETE', '/parts/1/markings');
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
    assert.deepEqual(db.sqlite.prepare('SELECT id FROM qc_marking').all().map((r) => r.id), [1]);
}));

test('POST /parts/:id/ping records a ping, and answers 400 with no marking', () => withRouter(async (call, db) => {
    const ok = await call('POST', '/parts/1/ping');
    assert.equal(ok.status, 200);
    assert.deepEqual(await ok.json(), { ok: true });
    assert.equal(count(db, 'SELECT ping_count AS n FROM qc_ping WHERE part_id = 1 AND company_id = 10'), 1);

    await call('DELETE', '/parts/1/markings');
    const none = await call('POST', '/parts/1/ping');
    assert.equal(none.status, 400);
    assert.deepEqual(await none.json(), { error: 'Add a marking before pinging' });
}));

test('GET /photos/:id answers the bytes with their mimetype and nosniff', () => withRouter(async (call) => {
    const res = await call('GET', '/photos/1');
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'image/jpeg');
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.deepEqual(Buffer.from(await res.arrayBuffer()), PHOTO_BYTES);
}));

test('ids that are not positive integers answer 404', () => withRouter(async (call) => {
    for (const path of ['/parts/abc', '/parts/0', '/photos/1x', '/markings/-1']) {
        const res = await call('GET', path);
        assert.equal(res.status, 404, path);
        assert.deepEqual(await res.json(), { error: 'Not found' }, path);
    }
}));

test('a request with no token answers 401 and an admin token is refused', () => withRouter(async (call) => {
    assert.equal((await call('GET', '/parts/1', { token: null })).status, 401);
    assert.notEqual((await call('GET', '/parts/1', { token: adminToken })).status, 200);
}));

test('an unexpected error answers a generic 500 without its message', async () => {
    const db = seedAll();
    const failing = { execute: async (sql, params) => {
        if (/FROM qc_marking/.test(sql)) throw new Error('secret table detail');
        return db.execute(sql, params);
    } };
    const error = mock.method(console, 'error', () => {});
    try {
        await withRouter(async (call) => {
            const res = await call('GET', '/parts/1');
            assert.equal(res.status, 500);
            assert.deepEqual(await res.json(), { error: 'Internal Server Error' });
        }, failing);
    } finally {
        error.mock.restore();
    }
});
