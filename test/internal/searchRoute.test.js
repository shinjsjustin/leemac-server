const { test } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const { start } = require('../helpers/server');
const { makeShopDb } = require('../helpers/shopSqliteDb');

const db = makeShopDb();
const dbPath = require.resolve('../../src/db/db.js');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: db };
const router = require('../../src/routes/adminSearch');

async function get(path, access) {
    const app = express();
    app.use((req, res, next) => { req.user = { access }; next(); });
    app.use('/', router);
    const server = await start(app);
    try {
        const res = await fetch(`${server.baseUrl}${path}`);
        return { status: res.status, body: await res.json() };
    } finally { await server.close(); }
}

test('GET /search returns grouped results for the caller access', async () => {
    await db.execute("INSERT INTO job (job_number, invoice_number) VALUES ('J1', 'INV-1')");
    const low = await get('/search?q=J1', 1);
    assert.strictEqual(low.status, 200);
    assert.deepStrictEqual(low.body.invoices, []);
    assert.strictEqual(low.body.jobs.length, 1);
    assert.strictEqual((await get('/search?q=INV-1', 3)).body.invoices.length, 1);
});

test('GET /search with no q returns empty lists', async () => {
    assert.deepStrictEqual((await get('/search', 3)).body, { parts: [], jobs: [], invoices: [] });
});

test('GET /badges omits waiting_invoices below access 3', async () => {
    assert.deepStrictEqual((await get('/badges', 2)).body, { active_parts: 0, new_requests: 0, qc_requests: 0 });
    assert.deepStrictEqual((await get('/badges', 3)).body, { active_parts: 0, new_requests: 0, qc_requests: 0, waiting_invoices: 1 });
});

test('GET /badges counts an open QC ping in qc_requests', async () => {
    await db.execute("INSERT INTO company (name) VALUES ('Acme')");
    await db.execute("INSERT INTO part (number) VALUES ('P-1')");
    await db.execute(
        "INSERT INTO qc_ping (part_id, company_id, pinged_by_name, pinged_at, ping_count) VALUES (1, 1, 'Pat', '2026-01-01 00:00:00', 1)"
    );
    assert.strictEqual((await get('/badges', 2)).body.qc_requests, 1);
});
