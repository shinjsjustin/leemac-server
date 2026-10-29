const { test } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const { start } = require('../helpers/server');
const { makeNotesDb } = require('../helpers/notesSqliteDb');

const dbPath = require.resolve('../../src/db/db.js');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {} };

const { createNotesRouter } = require('../../src/routes/notes');
const defaultRouter = require('../../src/routes/notes');

function seed() {
    const db = makeNotesDb();
    db.sqlite.exec(`
        INSERT INTO admin (id, name, email) VALUES (1, 'Zed', 'z@x.com'), (2, 'Amy', 'a@x.com');
        INSERT INTO job (id, company_id, job_number) VALUES (1, 10, 'J-2'), (2, 10, 'J-1');
        INSERT INTO part (id, number) VALUES (5, 'P-5');
        INSERT INTO note (id, content, userid, jobid, created_at) VALUES (1, 'admin note', 1, 1, '2026-01-01 00:00:00');
        INSERT INTO note (id, content, userid, jobid, client_name, shared, created_at) VALUES (2, 'client note', 2, 2, 'Cara', 1, '2026-01-02 00:00:00');
        INSERT INTO note (id, content, userid, jobid, part_id, created_at) VALUES (3, 'part note', 2, NULL, 5, '2026-01-03 00:00:00');
    `);
    return db;
}

async function withRouter(fn) {
    const db = seed();
    const app = express();
    app.use(express.json());
    app.use('/n', createNotesRouter({ db }));
    const server = await start(app);
    const call = (method, path, body) => fetch(`${server.baseUrl}/n${path}`, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : {},
        body: body ? JSON.stringify(body) : undefined,
    });
    try {
        await fn(call, db);
    } finally {
        await server.close();
    }
}

test('default export is a router and createNotesRouter is attached', () => {
    assert.strictEqual(typeof defaultRouter, 'function');
    assert.strictEqual(typeof createNotesRouter, 'function');
});

test('PUT /share sets shared for admin notes', () => withRouter(async (call, db) => {
    for (const [shared, expected] of [[true, 1], [1, 1], [false, 0], [0, 0]]) {
        const res = await call('PUT', '/share', { id: 1, shared });
        assert.strictEqual(res.status, 200);
        assert.deepStrictEqual(await res.json(), { ok: true, shared });
        assert.strictEqual(db.sqlite.prepare('SELECT shared FROM note WHERE id = 1').get().shared, expected);
    }
}));

test('PUT /share rejects bad bodies, unknown ids and client notes', () => withRouter(async (call) => {
    assert.strictEqual((await call('PUT', '/share', { shared: true })).status, 400);
    assert.strictEqual((await call('PUT', '/share', { id: 1 })).status, 400);
    assert.strictEqual((await call('PUT', '/share', { id: 1, shared: 'yes' })).status, 400);
    assert.strictEqual((await call('PUT', '/share', { id: 1, shared: 2 })).status, 400);
    assert.strictEqual((await call('PUT', '/share', { id: 99, shared: true })).status, 404);
    assert.strictEqual((await call('PUT', '/share', { id: 2, shared: false })).status, 400);
}));

test('PUT /updatestatus is gone', () => withRouter(async (call) => {
    assert.strictEqual((await call('PUT', '/updatestatus', { id: 1, status: 'done' })).status, 404);
}));

test('getnote returns author, is_client, shared and no status', () => withRouter(async (call) => {
    const rows = await (await call('GET', '/getnote?jobid=2')).json();
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].author, 'Cara');
    assert.strictEqual(rows[0].is_client, 1);
    assert.strictEqual(rows[0].shared, 1);
    assert.strictEqual(rows[0].id, 2);
    assert.ok(!('status' in rows[0]));
    const admin = await (await call('GET', '/getnote?jobid=1')).json();
    assert.strictEqual(admin[0].author, 'Zed');
    assert.strictEqual(admin[0].is_client, 0);
    assert.strictEqual(admin[0].shared, 0);
}));

test('getrecentnote returns author and no status', () => withRouter(async (call) => {
    const note = await (await call('GET', '/getrecentnote?jobid=1')).json();
    assert.strictEqual(note.author, 'Zed');
    assert.strictEqual(note.is_client, 0);
    assert.strictEqual(note.shared, 0);
    assert.ok(!('status' in note));
}));

test('listnotes includes part notes and exposes author fields', () => withRouter(async (call) => {
    const rows = await (await call('GET', '/listnotes')).json();
    assert.deepStrictEqual(rows.map((r) => r.id), [1, 2, 3]);
    const part = rows[2];
    assert.strictEqual(part.part_id, 5);
    assert.strictEqual(part.part_number, 'P-5');
    assert.strictEqual(part.job_number, null);
    assert.strictEqual(part.author, 'Amy');
    assert.strictEqual(rows[1].author, 'Cara');
    assert.strictEqual(rows[1].is_client, 1);
    assert.strictEqual(rows[1].shared, 1);
    assert.strictEqual(rows[0].job_number, 'J-2');
    assert.ok(rows.every((r) => !('status' in r)));
}));

test('listnotes sorts by author and job_number and rejects other fields', () => withRouter(async (call) => {
    const byAuthor = await (await call('GET', '/listnotes?sortBy=author&order=asc')).json();
    assert.deepStrictEqual(byAuthor.map((r) => r.author), ['Amy', 'Cara', 'Zed']);
    const byJob = await (await call('GET', '/listnotes?sortBy=job_number&order=desc')).json();
    assert.deepStrictEqual(byJob.map((r) => r.id), [1, 2, 3]);
    const byDate = await (await call('GET', '/listnotes?sortBy=created_at&order=desc')).json();
    assert.deepStrictEqual(byDate.map((r) => r.id), [3, 2, 1]);
    assert.strictEqual((await call('GET', '/listnotes?sortBy=status')).status, 400);
    assert.strictEqual((await call('GET', '/listnotes?sortBy=admin_name')).status, 400);
}));

test('newnote inserts with shared defaulting to 0', () => withRouter(async (call, db) => {
    const res = await call('POST', '/newnote', { content: 'hi', userid: 1, jobid: 1 });
    assert.strictEqual(res.status, 201);
    const { id } = await res.json();
    assert.strictEqual(db.sqlite.prepare('SELECT shared FROM note WHERE id = ?').get(id).shared, 0);
}));
