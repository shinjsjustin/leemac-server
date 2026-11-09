const { test, mock } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { start } = require('../helpers/server');
const { makeQcDb } = require('../helpers/qcSqliteDb');
const { SESSION_HANDLER, clientToken: signClientToken } = require('../helpers/session');

const sessionDb = { execute: async () => [SESSION_HANDLER.rows], query: async () => [SESSION_HANDLER.rows] };
const dbPath = require.resolve('../../src/db/db.js');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: sessionDb };

const { createPortalQcRouter } = require('../../src/routes/portalQc');

const COMPANY_A = 10;
const COMPANY_B = 20;
const tokenA = signClientToken({ id: 1, username: 'a', name: 'Ann', company_id: COMPANY_A });
const tokenB = signClientToken({ id: 2, username: 'b', name: 'Bob', company_id: COMPANY_B });

const A_BYTES = 'COMPANY-A-PHOTO-BYTES';
const B_BYTES = 'COMPANY-B-PHOTO-BYTES';
const POINT = { file_id: 1, page: 1, kind: 'point', x1: 0.5, y1: 0.5, size: 10, note: 'A-PRIVATE-NOTE' };

// Part 1 is only A's (drawing 1), part 2 only B's. Part 3 is on a job of each company.
// Marking 1 is Leemac's on part 3, marking 2 is A's on part 1.
// Photo 1 is on A's marking, photo 2 is on Leemac's marking for A's job, photo 3 on it for B's job.
function seed() {
    const db = makeQcDb();
    db.sqlite.exec(`
        INSERT INTO job (id, company_id, job_number) VALUES (1, ${COMPANY_A}, 'A-1'), (2, ${COMPANY_B}, 'B-1');
        INSERT INTO part (id, number) VALUES (1, 'P-1'), (2, 'P-2'), (3, 'P-3');
        INSERT INTO job_part (job_id, part_id, quantity) VALUES (1, 1, 1), (2, 2, 1), (1, 3, 1), (2, 3, 1);
        INSERT INTO uploaded_files (id, filename, part_id) VALUES (1, 'a.pdf', 1), (3, 'c.pdf', 3);
        INSERT INTO qc_marking (id, part_id, file_id, page, company_id, kind, x1, y1, size, note, author_id, author_name, created_at, updated_at)
            VALUES (1, 3, 3, 1, NULL, 'point', 0.1, 0.1, 5, 'leemac', '9', 'Leemac', 'now', 'now'),
                   (2, 1, 1, 1, ${COMPANY_A}, 'point', 0.2, 0.2, 5, 'A-PRIVATE-NOTE', '1', 'Ann', 'now', 'now');
    `);
    const photo = db.sqlite.prepare(
        "INSERT INTO qc_photo (id, marking_id, job_id, position, mimetype, size, content) VALUES (?, ?, ?, 1, 'image/png', ?, ?)"
    );
    photo.run(1, 2, 1, A_BYTES.length, Buffer.from(A_BYTES));
    photo.run(2, 1, 1, A_BYTES.length, Buffer.from(A_BYTES));
    photo.run(3, 1, 2, B_BYTES.length, Buffer.from(B_BYTES));
    return db;
}

async function withServer(fn) {
    const db = seed();
    const app = express();
    app.use(express.json());
    app.use('/q', createPortalQcRouter({ db, writeLimiter: (req, res, next) => next() }));
    const info = mock.method(console, 'info', () => {});
    const server = await start(app);
    const call = (method, path, token, body) => fetch(`${server.baseUrl}/q${path}`, {
        method,
        headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
    });
    try {
        await fn(call, db);
    } finally {
        await server.close();
        info.mock.restore();
    }
}

async function assertRefused(res, label) {
    const text = await res.text();
    assert.equal(res.status, 404, label);
    assert.deepEqual(JSON.parse(text), { error: 'Not found' }, label);
    for (const secret of [A_BYTES, B_BYTES, 'A-PRIVATE-NOTE']) {
        assert.ok(!text.includes(secret), `${label} leaks ${secret}`);
    }
}

const rows = (db, sql) => db.sqlite.prepare(sql).all().map((r) => ({ ...r }));

test("company B is refused A's part on every part route, and nothing changes", () => withServer(async (call, db) => {
    const before = rows(db, 'SELECT * FROM qc_marking');
    const attempts = [
        ['GET', '/parts/1'],
        ['POST', '/parts/1/markings', POINT],
        ['DELETE', '/parts/1/markings'],
        ['POST', '/parts/1/ping'],
    ];
    for (const [method, path, body] of attempts) {
        await assertRefused(await call(method, path, tokenB, body), `${method} ${path}`);
    }
    assert.deepEqual(rows(db, 'SELECT * FROM qc_marking'), before);
    assert.equal(rows(db, 'SELECT * FROM qc_ping').length, 0);
    assert.equal(rows(db, 'SELECT * FROM qc_photo').length, 3);
}));

test("company B is refused A's marking on update and delete, and it survives", () => withServer(async (call, db) => {
    await assertRefused(await call('PUT', '/markings/2', tokenB, { ...POINT, note: 'hijack' }), 'PUT');
    await assertRefused(await call('DELETE', '/markings/2', tokenB), 'DELETE');
    assert.deepEqual(rows(db, 'SELECT note FROM qc_marking WHERE id = 2'), [{ note: 'A-PRIVATE-NOTE' }]);
}));

test("company B is refused A's photos, including Leemac's marking photo taken for A's job", () => withServer(async (call) => {
    await assertRefused(await call('GET', '/photos/1', tokenB), 'photo on A marking');
    await assertRefused(await call('GET', '/photos/2', tokenB), 'photo on Leemac marking for A job');
}));

test("company A is refused the photo taken for B's job on a shared Leemac marking", () => withServer(async (call) => {
    await assertRefused(await call('GET', '/photos/3', tokenA), 'photo for B job');
    const own = await call('GET', '/photos/2', tokenA);
    assert.equal(own.status, 200);
    assert.equal(await own.text(), A_BYTES);
}));

test("a shared part shows each company only its own markings and job photos", () => withServer(async (call) => {
    const asB = await (await call('GET', '/parts/3', tokenB)).json();
    assert.deepEqual(asB.markings.map((m) => m.id), [1]);
    assert.deepEqual(asB.photos.map((job) => job.job_number), ['B-1']);
    assert.deepEqual(asB.photos[0].photos.map((p) => p.id), [3]);

    const asA = await (await call('GET', '/parts/3', tokenA)).json();
    assert.deepEqual(asA.photos.map((job) => job.job_number), ['A-1']);
}));

test('unknown ids answer the same 404 as foreign ones', () => withServer(async (call) => {
    await assertRefused(await call('GET', '/parts/999', tokenA), 'part');
    await assertRefused(await call('GET', '/photos/999', tokenA), 'photo');
    await assertRefused(await call('PUT', '/markings/999', tokenA, POINT), 'marking');
}));
