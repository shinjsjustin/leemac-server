const { test } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const { start } = require('../helpers/server');
const { makeShopDb } = require('../helpers/shopSqliteDb');

const db = makeShopDb();
const dbPath = require.resolve('../../src/db/db.js');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: db };

const starsRouter = require('../../src/routes/job/stars');
const nfcRouter = require('../../src/routes/job/nfc');

function reset() {
    db.sqlite.exec(`
        DELETE FROM star_status_history; DELETE FROM stars; DELETE FROM job_part; DELETE FROM part; DELETE FROM job; DELETE FROM company;
        INSERT INTO company (id, name) VALUES (10, 'Acme');
        INSERT INTO job (id, company_id, job_number) VALUES (3, 10, 'J-1');
        INSERT INTO part (id, number) VALUES (5, 'P-5');
        INSERT INTO job_part (id, job_id, part_id) VALUES (7, 3, 5);
        INSERT INTO stars (id, job_part_id, status, nfc_tag_id) VALUES (4, 7, 'open', 'tag-1');
    `);
}
const history = () => db.sqlite.prepare('SELECT job_part_id, from_status, to_status, source FROM star_status_history').all().map((r) => ({ ...r }));

async function withApp(fn) {
    reset();
    const app = express();
    app.use(express.json());
    app.use('/j', starsRouter);
    app.use('/j', nfcRouter);
    const server = await start(app);
    const put = async (path, body) => {
        const res = await fetch(`${server.baseUrl}/j${path}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        });
        return { status: res.status, body: await res.json() };
    };
    try { await fn(put); } finally { await server.close(); }
}

test('updatestarjobstatus logs an admin row once and not on repeat', () => withApp(async (put) => {
    const r = await put('/updatestarjobstatus', { jobPartId: 7, status: 'programming' });
    assert.deepStrictEqual(r, { status: 200, body: { message: 'Star status updated successfully' } });
    assert.deepStrictEqual(history(), [{ job_part_id: 7, from_status: 'open', to_status: 'programming', source: 'admin' }]);
    await put('/updatestarjobstatus', { jobPartId: 7, status: 'programming' });
    assert.strictEqual(history().length, 1);
}));

test('updatestarjobstatus answers 200 when no star matches', () => withApp(async (put) => {
    const r = await put('/updatestarjobstatus', { jobPartId: 99, status: 'programming' });
    assert.deepStrictEqual(r, { status: 200, body: { message: 'Star status updated successfully' } });
    assert.strictEqual(history().length, 0);
}));

test('updatestarjobstatus rejects an invalid status', () => withApp(async (put) => {
    const r = await put('/updatestarjobstatus', { jobPartId: 7, status: 'bogus' });
    assert.deepStrictEqual(r, { status: 400, body: { error: 'Invalid job part ID or status' } });
}));

test('updatestarstatusbyjobnumber logs an admin row, 404s when unmatched', () => withApp(async (put) => {
    const r = await put('/updatestarstatusbyjobnumber', { jobNumber: 'J-1', partNumber: 'P-5', status: 'programming' });
    assert.deepStrictEqual(r, { status: 200, body: { message: 'Status updated successfully' } });
    assert.deepStrictEqual(history(), [{ job_part_id: 7, from_status: 'open', to_status: 'programming', source: 'admin' }]);
    await put('/updatestarstatusbyjobnumber', { jobNumber: 'J-1', partNumber: 'P-5', status: 'programming' });
    assert.strictEqual(history().length, 1);
    const miss = await put('/updatestarstatusbyjobnumber', { jobNumber: 'J-9', partNumber: 'P-5', status: 'open' });
    assert.deepStrictEqual(miss, { status: 404, body: { error: 'No starred part found for that job / part combination' } });
}));

test('updatestarstatusbynfctag logs an nfc row, 404s when unmatched', () => withApp(async (put) => {
    const r = await put('/updatestarstatusbynfctag', { nfcTagId: 'tag-1', status: 'programming' });
    assert.deepStrictEqual(r, { status: 200, body: { message: 'Status updated via NFC tag' } });
    assert.deepStrictEqual(history(), [{ job_part_id: 7, from_status: 'open', to_status: 'programming', source: 'nfc' }]);
    await put('/updatestarstatusbynfctag', { nfcTagId: 'tag-1', status: 'programming' });
    assert.strictEqual(history().length, 1);
    const miss = await put('/updatestarstatusbynfctag', { nfcTagId: 'nope', status: 'open' });
    assert.deepStrictEqual(miss, { status: 404, body: { error: 'No starred part found for this NFC tag' } });
}));
