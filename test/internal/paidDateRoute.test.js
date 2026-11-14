const { test } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const { start } = require('../helpers/server');
const { makeShopDb } = require('../helpers/shopSqliteDb');

const db = makeShopDb();
const dbPath = require.resolve('../../src/db/db.js');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: db };
const router = require('../../src/routes/invoices');

function reset() {
    db.sqlite.exec(`
        DELETE FROM job; DELETE FROM company;
        INSERT INTO company (id, name) VALUES (10, 'Acme');
        INSERT INTO job (id, company_id, invoice_number, invoice_status) VALUES (3, 10, 'INV-1', 'waiting');
        INSERT INTO job (id, company_id, invoice_number, invoice_status) VALUES (6, 10, 'INV-6', 'paid');
    `);
}
const paidDate = (id) => db.sqlite.prepare('SELECT paid_date d FROM job WHERE id = ?').get(id).d;

async function withApp(fn) {
    reset();
    const app = express();
    app.use(express.json());
    app.use('/i', router);
    const server = await start(app);
    const patch = async (path, body) => {
        const res = await fetch(`${server.baseUrl}/i${path}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        });
        return { status: res.status, body: await res.json() };
    };
    try { await fn(patch); } finally { await server.close(); }
}

test('PATCH saves the date on a paid invoice and null clears it', () => withApp(async (patch) => {
    assert.strictEqual((await patch('/paid-date/6', { paid_date: '2026-11-03' })).status, 200);
    assert.strictEqual(paidDate(6), '2026-11-03');
    assert.strictEqual((await patch('/paid-date/6', { paid_date: null })).status, 200);
    assert.strictEqual(paidDate(6), null);
}));

for (const [name, id, value, code] of [
    ['impossible date', 6, '2026-02-30', 400],
    ['not a date', 6, 'soon', 400],
    ['waiting invoice', 3, '2026-11-03', 400],
    ['unknown job', 99, '2026-11-03', 404],
]) {
    test(`PATCH answers ${code} for ${name} and saves nothing`, () => withApp(async (patch) => {
        const res = await patch(`/paid-date/${id}`, { paid_date: value });
        assert.strictEqual(res.status, code);
        assert.ok(res.body.error);
        assert.strictEqual(paidDate(6), null);
        assert.strictEqual(paidDate(3), null);
    }));
}
