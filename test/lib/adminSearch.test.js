const { test } = require('node:test');
const assert = require('node:assert');
const { makeShopDb } = require('../helpers/shopSqliteDb');
const { searchAdmin } = require('../../src/lib/adminSearch');
const { getBadges } = require('../../src/lib/adminBadges');

async function seed() {
    const db = makeShopDb();
    await db.execute("INSERT INTO company (name) VALUES ('Acme Corp')");
    await db.execute("INSERT INTO company (name) VALUES ('Other')");
    await db.execute("INSERT INTO part (number, description) VALUES ('BRK-1', 'Steel bracket')");
    await db.execute("INSERT INTO part (number, description) VALUES ('GEAR', 'Big gear')");
    await db.execute("INSERT INTO job (job_number, company_id, po_number, attention, invoice_number, invoice_status) VALUES ('J100', 1, 'PO-77', 'Bob', 'INV-9', 'waiting')");
    await db.execute("INSERT INTO job (job_number, company_id, po_number, attention) VALUES ('J200', 2, 'PO-88', 'Sue')");
    return db;
}

test('finds parts by number or description', async () => {
    const db = await seed();
    assert.deepStrictEqual((await searchAdmin(db, 'brk', 1)).parts, [{ part_id: 1, number: 'BRK-1', description: 'Steel bracket' }]);
    assert.deepStrictEqual((await searchAdmin(db, 'big g', 1)).parts.map((p) => p.number), ['GEAR']);
});

test('finds jobs by job number, PO, company and attention', async () => {
    const db = await seed();
    const expected = [{ id: 1, job_number: 'J100', company_name: 'Acme Corp', attention: 'Bob', po_number: 'PO-77' }];
    for (const q of ['J100', 'PO-77', 'acme', 'bob']) {
        assert.deepStrictEqual((await searchAdmin(db, q, 1)).jobs, expected, q);
    }
});

test('invoices are returned at access 3 only', async () => {
    const db = await seed();
    assert.deepStrictEqual((await searchAdmin(db, 'INV-9', 3)).invoices, [
        { job_id: 1, invoice_number: 'INV-9', job_number: 'J100', company_name: 'Acme Corp', invoice_status: 'waiting' },
    ]);
    assert.deepStrictEqual((await searchAdmin(db, 'INV-9', 2)).invoices, []);
});

test('a query under 2 characters returns empty lists', async () => {
    const db = await seed();
    assert.deepStrictEqual(await searchAdmin(db, ' J ', 3), { parts: [], jobs: [], invoices: [] });
});

test('percent and underscore match literally', async () => {
    const db = await seed();
    assert.deepStrictEqual((await searchAdmin(db, '%%', 3)).jobs, []);
    assert.deepStrictEqual((await searchAdmin(db, 'J_00', 3)).jobs, []);
    await db.execute("INSERT INTO part (number, description) VALUES ('X_1', '100% pure')");
    assert.deepStrictEqual((await searchAdmin(db, 'X_1', 1)).parts.map((p) => p.number), ['X_1']);
    assert.deepStrictEqual((await searchAdmin(db, '0% p', 1)).parts.map((p) => p.number), ['X_1']);
});

test('each list is capped at 6', async () => {
    const db = makeShopDb();
    for (let i = 0; i < 8; i++) await db.execute('INSERT INTO part (number, description) VALUES (?, ?)', [`PART${i}`, 'd']);
    assert.strictEqual((await searchAdmin(db, 'PART', 1)).parts.length, 6);
});

test('badges count active starred parts and sent requests, waiting invoices at access 3', async () => {
    const db = await seed();
    await db.execute("INSERT INTO job_part (job_id, part_id) VALUES (1, 1), (1, 2), (2, 2)");
    await db.execute("INSERT INTO stars (job_part_id, status) VALUES (1, 'open'), (2, 'running_machine_a'), (3, 'done')");
    await db.execute("INSERT INTO quote_request (company_id, status) VALUES (1, 'sent'), (1, 'sent'), (1, 'in_review')");
    assert.deepStrictEqual(await getBadges(db, 3), { active_parts: 2, new_requests: 2, waiting_invoices: 1 });
    assert.deepStrictEqual(await getBadges(db, 2), { active_parts: 2, new_requests: 2 });
});
