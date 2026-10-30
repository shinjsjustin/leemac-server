const { test } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const { start } = require('../helpers/server');
const { makeShopDb } = require('../helpers/shopSqliteDb');
const { requireAdmin } = require('../../src/middleware/requireRole');

const db = makeShopDb();
const dbPath = require.resolve('../../src/db/db.js');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: db };

const overviewRouter = require('../../src/routes/job/overview');

db.sqlite.exec(`
    INSERT INTO company (id, name) VALUES (10, 'Acme');
    INSERT INTO job (id, company_id, job_number) VALUES (3, 10, 'J-1');
    INSERT INTO part (id, number) VALUES (5, 'P-5');
    INSERT INTO job_part (id, job_id, part_id, quantity, price) VALUES (7, 3, 5, 2, 9);
    INSERT INTO stars (job_part_id, status) VALUES (7, 'setup');
`);

async function get(user) {
    const app = express();
    app.use((req, res, next) => { req.user = user; next(); });
    app.use('/j', requireAdmin(1), overviewRouter);
    const server = await start(app);
    try {
        const res = await fetch(`${server.baseUrl}/j/schedule`);
        return { status: res.status, body: await res.json() };
    } finally { await server.close(); }
}

test('GET /schedule returns the admin schedule to a level-1 admin', async () => {
    const r = await get({ role: 'admin', access: 1 });
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(Object.keys(r.body).sort(), ['board', 'undated', 'window']);
    assert.strictEqual(r.body.board[0].company_name, 'Acme');
    assert.strictEqual(r.body.undated[0].job_number, 'J-1');
});

test('GET /schedule is forbidden to a client token', async () => {
    const r = await get({ role: 'client', company_id: 10 });
    assert.strictEqual(r.status, 403);
});

test('GET /schedule returns a generic 500 when the db throws', async () => {
    const orig = db.execute;
    db.execute = async () => { throw new Error('secret db detail'); };
    const origErr = console.error;
    console.error = () => {};
    try {
        const r = await get({ role: 'admin', access: 1 });
        assert.strictEqual(r.status, 500);
        assert.deepStrictEqual(r.body, { error: 'Failed to load schedule' });
    } finally { db.execute = orig; console.error = origErr; }
});
