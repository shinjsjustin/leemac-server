const { test } = require('node:test');
const assert = require('node:assert');
const { makeShopDb } = require('../helpers/shopSqliteDb');
const { markInvoicePaid, InvoicePaidError } = require('../../src/lib/invoicePaid');

function seed() {
    const db = makeShopDb();
    db.sqlite.exec(`
        INSERT INTO company (id, name) VALUES (10, 'Acme');
        INSERT INTO job (id, company_id, job_number, invoice_number, invoice_status) VALUES (3, 10, 'J-1', 'INV-1', 'waiting');
        INSERT INTO job (id, company_id, job_number, invoice_number, invoice_status) VALUES (4, 10, 'J-2', 'INV-2', 'waiting');
        INSERT INTO job (id, company_id, job_number, invoice_number, invoice_status) VALUES (5, 10, 'J-3', NULL, 'waiting');
        INSERT INTO job (id, company_id, job_number, invoice_number, invoice_status) VALUES (6, 10, 'J-4', 'INV-4', 'paid');
        INSERT INTO part (id, number) VALUES (1, 'P-1');
        INSERT INTO job_part (id, job_id, part_id) VALUES (7, 3, 1), (8, 3, 1), (9, 4, 1);
        INSERT INTO stars (job_part_id, status) VALUES (7, 'open'), (8, 'urgent'), (9, 'open');
    `);
    return db;
}
const status = (db, id) => db.sqlite.prepare('SELECT invoice_status s FROM job WHERE id = ?').get(id).s;
const starIds = (db) => db.sqlite.prepare('SELECT job_part_id j FROM stars ORDER BY j').all().map((r) => r.j);

test('marks paid, deletes only that job stars and counts them', async () => {
    const db = seed();
    assert.deepStrictEqual(await markInvoicePaid(db, 3), { unstarred: 2 });
    assert.strictEqual(status(db, 3), 'paid');
    assert.strictEqual(status(db, 4), 'waiting');
    assert.deepStrictEqual(starIds(db), [9]);
});

test('writes no history row', async () => {
    const db = seed();
    await markInvoicePaid(db, 3);
    assert.strictEqual(db.sqlite.prepare('SELECT COUNT(*) n FROM star_status_history').get().n, 0);
});

test('returns unstarred 0 for a job with no stars', async () => {
    const db = seed();
    db.sqlite.exec('DELETE FROM stars');
    assert.deepStrictEqual(await markInvoicePaid(db, 3), { unstarred: 0 });
    assert.strictEqual(status(db, 3), 'paid');
});

for (const [name, id, code, message] of [
    ['missing job', 99, 404, 'Job not found'],
    ['no invoice number', 5, 400, 'Job does not have an invoice number'],
    ['already paid', 6, 400, 'Invoice is already marked as paid'],
]) {
    test(`throws ${code} for ${name} and changes nothing`, async () => {
        const db = seed();
        await assert.rejects(markInvoicePaid(db, id), (e) => {
            assert.ok(e instanceof InvoicePaidError);
            assert.strictEqual(e.status, code);
            assert.strictEqual(e.message, message);
            return true;
        });
        assert.deepStrictEqual(starIds(db), [7, 8, 9]);
    });
}
