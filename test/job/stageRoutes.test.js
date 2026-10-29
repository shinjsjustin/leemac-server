const { test } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const { start } = require('../helpers/server');
const { makeShopDb } = require('../helpers/shopSqliteDb');

const db = makeShopDb();
const dbPath = require.resolve('../../src/db/db.js');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: db };

const stageRouter = require('../../src/routes/job/stage');
const jobIndex = require('../../src/routes/job');

function reset() {
    db.sqlite.exec(`
        DELETE FROM star_status_history; DELETE FROM stars; DELETE FROM job_part; DELETE FROM part; DELETE FROM job; DELETE FROM company;
        INSERT INTO company (id, name) VALUES (10, 'Acme');
        INSERT INTO job (id, company_id, job_number) VALUES (3, 10, 'J-1');
        INSERT INTO part (id, number) VALUES (5, 'P-5');
        INSERT INTO job_part (id, job_id, part_id) VALUES (7, 3, 5);
        INSERT INTO job_part (id, job_id, part_id) VALUES (8, 3, 5);
        INSERT INTO stars (id, job_part_id, status, nfc_tag_id) VALUES (4, 7, 'open', 'tag-1');
    `);
}
const history = () => db.sqlite.prepare('SELECT job_part_id, kind, from_status, to_status, source FROM star_status_history ORDER BY id').all().map((r) => ({ ...r }));
const starCount = () => db.sqlite.prepare('SELECT COUNT(*) AS n FROM stars').get().n;

async function withApp(fn, router = stageRouter) {
    reset();
    const app = express();
    app.use(express.json());
    app.use('/j', router);
    const server = await start(app);
    const call = async (method, path, body) => {
        const res = await fetch(`${server.baseUrl}/j${path}`, {
            method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        });
        return { status: res.status, body: await res.json() };
    };
    try { await fn((p, b) => call('PUT', p, b), (p, b) => call('POST', p, b)); } finally { await server.close(); }
}

test('setstarstage changes status as admin and returns stage', () => withApp(async (put) => {
    const r = await put('/setstarstage', { jobPartId: 7, status: 'programming' });
    assert.deepStrictEqual(r, { status: 200, body: {
        jobPartId: 7, status: 'programming', previous: 'open', changed: true, stage: { key: 'preparing', label: 'Preparing' },
    } });
    assert.deepStrictEqual(history(), [{ job_part_id: 7, kind: 'status', from_status: 'open', to_status: 'programming', source: 'admin' }]);
}));

test('setstarstage rejects urgent, waiting and unknown statuses with 400', () => withApp(async (put) => {
    for (const status of ['urgent', 'waiting', 'bogus', undefined]) {
        const r = await put('/setstarstage', { jobPartId: 7, status });
        assert.strictEqual(r.status, 400, String(status));
    }
    assert.strictEqual((await put('/setstarstage', { status: 'qa' })).status, 400);
    assert.strictEqual(history().length, 0);
}));

test('setstarstage answers 404 when the part is not starred', () => withApp(async (put) => {
    assert.strictEqual((await put('/setstarstage', { jobPartId: 8, status: 'qa' })).status, 404);
    assert.strictEqual((await put('/setstarstage', { jobPartId: 99, status: 'qa' })).status, 404);
}));

test('Undo by resending the previous status logs a second row and deletes none', () => withApp(async (put) => {
    await put('/setstarstage', { jobPartId: 7, status: 'qa' });
    const r = await put('/setstarstage', { jobPartId: 7, status: 'open' });
    assert.strictEqual(r.body.previous, 'qa');
    assert.strictEqual(r.body.changed, true);
    assert.deepStrictEqual(history().map((h) => [h.from_status, h.to_status]), [['open', 'qa'], ['qa', 'open']]);
    assert.strictEqual(starCount(), 1);
}));

test('setstarflag sets and clears a flag, logging each change', () => withApp(async (put) => {
    const on = await put('/setstarflag', { jobPartId: 7, flag: 'urgent', on: true });
    assert.deepStrictEqual(on, { status: 200, body: { jobPartId: 7, flag: 'urgent', on: true, previous: false, changed: true } });
    const again = await put('/setstarflag', { jobPartId: 7, flag: 'urgent', on: true });
    assert.deepStrictEqual(again.body, { jobPartId: 7, flag: 'urgent', on: true, previous: true, changed: false });
    const off = await put('/setstarflag', { jobPartId: 7, flag: 'urgent', on: false });
    assert.strictEqual(off.body.previous, true);
    assert.deepStrictEqual(history(), [
        { job_part_id: 7, kind: 'urgent', from_status: '0', to_status: '1', source: 'admin' },
        { job_part_id: 7, kind: 'urgent', from_status: '1', to_status: '0', source: 'admin' },
    ]);
}));

test('setstarflag rejects a bad flag or non-boolean on, 404s unstarred', () => withApp(async (put) => {
    assert.strictEqual((await put('/setstarflag', { jobPartId: 7, flag: 'bogus', on: true })).status, 400);
    assert.strictEqual((await put('/setstarflag', { jobPartId: 7, flag: 'urgent', on: 1 })).status, 400);
    assert.strictEqual((await put('/setstarflag', { jobPartId: 7, flag: 'urgent', on: 'true' })).status, 400);
    assert.strictEqual((await put('/setstarflag', { jobPartId: 7, flag: 'urgent' })).status, 400);
    assert.strictEqual((await put('/setstarflag', { jobPartId: 8, flag: 'urgent', on: true })).status, 404);
    assert.strictEqual(history().length, 0);
}));

test('finishpart sets done, keeps the star and logs a row', () => withApp(async (put, post) => {
    const r = await post('/finishpart', { jobPartId: 7 });
    assert.deepStrictEqual(r, { status: 200, body: {
        jobPartId: 7, status: 'done', previous: 'open', changed: true, stage: { key: 'done', label: 'Done' },
    } });
    assert.strictEqual(starCount(), 1);
    assert.deepStrictEqual(history(), [{ job_part_id: 7, kind: 'status', from_status: 'open', to_status: 'done', source: 'admin' }]);
    assert.strictEqual((await post('/finishpart', { jobPartId: 8 })).status, 404);
    assert.strictEqual((await post('/finishpart', {})).status, 400);
}));

test('job index mounts the stage routes', () => withApp(async (put) => {
    const r = await put('/setstarstage', { jobPartId: 7, status: 'qa' });
    assert.strictEqual(r.status, 200);
}, jobIndex));
