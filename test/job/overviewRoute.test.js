const { test } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const { start } = require('../helpers/server');
const { makeShopDb } = require('../helpers/shopSqliteDb');

const db = makeShopDb();
const dbPath = require.resolve('../../src/db/db.js');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: db };

const overviewRouter = require('../../src/routes/job/overview');
const jobIndex = require('../../src/routes/job');

db.sqlite.exec(`
    INSERT INTO company (id, name) VALUES (10, 'Acme');
    INSERT INTO job (id, company_id, job_number, attention) VALUES (3, 10, 'J-1', 'Ann');
    INSERT INTO part (id, number) VALUES (5, 'P-5');
    INSERT INTO job_part (id, job_id, part_id, quantity, price) VALUES (7, 3, 5, 2, 9);
    INSERT INTO stars (job_part_id, attention, status, nfc_tag_id) VALUES (7, 'Ann', 'open', 'tag-x');
`);

async function get(router, access) {
    const app = express();
    app.use((req, res, next) => { req.user = { access }; next(); });
    app.use('/j', router);
    const server = await start(app);
    try {
        const res = await fetch(`${server.baseUrl}/j/overview`);
        return { status: res.status, body: await res.json() };
    } finally { await server.close(); }
}

test('GET /overview returns the overview for the user access level', async () => {
    const r = await get(overviewRouter, 1);
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.jobs[0].job_number, 'J-1');
    assert.ok(!('price' in r.body.jobs[0].parts[0]));
    const r3 = await get(overviewRouter, 3);
    assert.strictEqual(r3.body.jobs[0].parts[0].price, 9);
    assert.deepStrictEqual(r3.body.headline.invoices_waiting, { count: 0, total: 0 });
});

test('GET /overview is mounted in the job router', async () => {
    const r = await get(jobIndex, 2);
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.headline.open_value, 18);
});
