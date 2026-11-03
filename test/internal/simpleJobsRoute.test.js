const { test } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const { start } = require('../helpers/server');
const { makeShopDb } = require('../helpers/shopSqliteDb');
const { createSimpleJobsRouter } = require('../../src/routes/simpleJobs');

async function mounted(access, fn) {
    const db = makeShopDb();
    db.sqlite.prepare("INSERT INTO job (job_number) VALUES ('13709')").run();
    db.sqlite.prepare("INSERT INTO job (job_number, po_number) VALUES ('13710', 'PO1')").run();
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => { req.user = { id: 7, role: 'admin', access }; next(); });
    app.use('/simple', createSimpleJobsRouter({ db }));
    const server = await start(app);
    const call = (method, path) => fetch(`${server.baseUrl}/simple${path}`, { method });
    try {
        await fn(call, db);
    } finally {
        await server.close();
    }
}

const noBidAt = (db, id) => db.sqlite.prepare('SELECT no_bid_at FROM job WHERE id = ?').get(id).no_bid_at;

test('PUT then DELETE no-bid set and clear the mark for level 3', async () => {
    await mounted(3, async (call, db) => {
        assert.strictEqual((await call('PUT', '/jobs/1/no-bid')).status, 200);
        assert.ok(noBidAt(db, 1));
        assert.strictEqual(db.sqlite.prepare('SELECT no_bid_by FROM job WHERE id = 1').get().no_bid_by, 7);
        assert.strictEqual((await call('DELETE', '/jobs/1/no-bid')).status, 200);
        assert.strictEqual(noBidAt(db, 1), null);
    });
});

test('no-bid returns 404 for unknown jobs and 409 when the job has a PO', async () => {
    await mounted(3, async (call, db) => {
        for (const method of ['PUT', 'DELETE']) {
            assert.strictEqual((await call(method, '/jobs/999/no-bid')).status, 404, method);
            assert.strictEqual((await call(method, '/jobs/2/no-bid')).status, 409, method);
        }
        assert.strictEqual(noBidAt(db, 2), null);
    });
});

test('no-bid writes are 403 below level 3', async () => {
    await mounted(2, async (call, db) => {
        assert.strictEqual((await call('PUT', '/jobs/1/no-bid')).status, 403);
        assert.strictEqual(noBidAt(db, 1), null);
    });
});

test('GET /quoted returns the quoted cards and GET /overview an empty page; level 1 is 403', async () => {
    await mounted(2, async (call) => {
        const quoted = await (await call('GET', '/quoted?page=1')).json();
        assert.deepStrictEqual(quoted.jobs.map((j) => j.job_number), ['13709']);
        assert.deepStrictEqual(await (await call('GET', '/overview')).json(), { jobs: [], page: 1, pages: 1 });
    });
    await mounted(1, async (call) => {
        assert.strictEqual((await call('GET', '/overview')).status, 403);
        assert.strictEqual((await call('GET', '/quoted')).status, 403);
    });
});
