const { test } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const { start } = require('../helpers/server');
const { makeShopDb } = require('../helpers/shopSqliteDb');

const db = makeShopDb();
const dbPath = require.resolve('../../src/db/db.js');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: db };

const overviewRouter = require('../../src/routes/job/overview');

db.sqlite.exec(`
    INSERT INTO company (id, name) VALUES (10, 'Acme');
    INSERT INTO job (id, company_id, job_number) VALUES (3, 10, 'J-1');
    INSERT INTO job_part (id, job_id) VALUES (7, 3), (8, 3);
    INSERT INTO stars (job_part_id, status, nfc_tag_id) VALUES (8, 'open', 'tag-8');
`);

async function get(query) {
    const app = express();
    app.use((req, res, next) => { req.user = { access: 1 }; next(); });
    app.use('/j', overviewRouter);
    const server = await start(app);
    try {
        const res = await fetch(`${server.baseUrl}/j/jobstages${query}`);
        return { status: res.status, body: await res.json() };
    } finally { await server.close(); }
}

test('GET /jobstages returns the stages of the job', async () => {
    const r = await get('?id=3');
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(r.body.stages.map((s) => [s.job_part_id, s.starred, s.status]), [[7, false, null], [8, true, 'open']]);
});

test('GET /jobstages answers 400 without id', async () => {
    const r = await get('');
    assert.strictEqual(r.status, 400);
    assert.ok(r.body.error);
});

test('GET /jobstages answers 500 when the query fails', async () => {
    const orig = db.execute;
    db.execute = async () => { throw new Error('boom'); };
    const log = console.error;
    console.error = () => {};
    try {
        assert.strictEqual((await get('?id=3')).status, 500);
    } finally { db.execute = orig; console.error = log; }
});
