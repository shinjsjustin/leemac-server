const { test } = require('node:test');
const assert = require('node:assert');
const { makeShopDb } = require('../helpers/shopSqliteDb');
const { getAdminOverview } = require('../../src/lib/adminOverview');

const NOW = new Date(2026, 5, 10);

function seed() {
    const db = makeShopDb();
    db.sqlite.exec(`
        INSERT INTO company (id, name) VALUES (10, 'Acme');
        INSERT INTO job (id, company_id, job_number, attention, po_number, due_date, invoice_number, invoice_status, total_cost)
            VALUES (1, 10, 'J-1', 'Ann', 'PO1', '2026-06-12', 'INV-1', 'waiting', 500),
                   (2, 10, 'J-2', 'Bob', 'PO2', '2026-06-01', NULL, 'waiting', NULL),
                   (3, 10, 'J-3', 'Cy', NULL, NULL, NULL, 'waiting', NULL);
        INSERT INTO part (id, number, description) VALUES (5, 'P-5', 'Bracket'), (6, 'P-6', 'Plate');
        INSERT INTO job_part (id, job_id, part_id, quantity, price, rev, material, finish) VALUES
            (7, 1, 5, 4, 10, 'A', 'AL', 'anod'),
            (8, 1, 6, 2, 50, 'B', 'SS', NULL),
            (9, 2, 5, 1, 7, NULL, NULL, NULL),
            (11, 3, 5, 1, 1, NULL, NULL, NULL);
        INSERT INTO stars (job_part_id, attention, status, nfc_tag_id, urgent, waiting) VALUES
            (7, 'Ann', 'programming', 'tag-secret', 1, 0),
            (8, 'Ann', 'done', NULL, 0, 1),
            (9, 'Bob', 'open', NULL, 0, 0);
        INSERT INTO star_status_history (job_part_id, job_id, company_id, to_status, source, kind, changed_at) VALUES
            (7, 1, 10, 'setup', 'admin', 'status', '2026-06-01 08:00:00'),
            (7, 1, 10, 'programming', 'admin', 'status', '2026-06-05 09:00:00'),
            (7, 1, 10, 'urgent', 'admin', 'flag', '2026-06-09 09:00:00');
    `);
    return db;
}

test('returns only jobs with a starred part, with job fields and due flag', async () => {
    const o = await getAdminOverview(seed(), 3, NOW);
    assert.deepStrictEqual(o.jobs.map((j) => [j.id, j.job_number, j.company_name, j.attention, j.po_number, j.due_date, j.flag, j.invoice_number, j.invoice_status]), [
        [1, 'J-1', 'Acme', 'Ann', 'PO1', '2026-06-12', 'due_soon', 'INV-1', 'waiting'],
        [2, 'J-2', 'Acme', 'Bob', 'PO2', '2026-06-01', 'overdue', null, 'waiting'],
    ]);
});

test('part carries stage, flags, since and paired but never the tag id', async () => {
    const o = await getAdminOverview(seed(), 3, NOW);
    const [p7, p8] = o.jobs[0].parts;
    assert.deepStrictEqual(p7, {
        job_part_id: 7, part_id: 5, number: 'P-5', rev: 'A', description: 'Bracket', material: 'AL', finish: 'anod',
        quantity: 4, price: 10, status: 'programming', stage: { key: 'preparing', label: 'Preparing' },
        urgent: true, waiting: false, since: '2026-06-05 09:00:00', paired: true,
    });
    assert.strictEqual(p8.since, null);
    assert.strictEqual(p8.paired, false);
    assert.strictEqual(p8.waiting, true);
    assert.ok(!JSON.stringify(o).includes('tag-secret'));
});

test('headline, contacts and stage counts cover active parts only', async () => {
    const o = await getAdminOverview(seed(), 3, NOW);
    assert.deepStrictEqual(o.headline, {
        active_parts: 2, due_soon: 1, overdue: 1, open_value: 47,
        invoices_waiting: { count: 1, total: 500 },
    });
    assert.deepStrictEqual(o.contacts, [{ attention: 'Ann', count: 1 }, { attention: 'Bob', count: 1 }]);
    assert.strictEqual(o.stage_counts.preparing, 1);
    assert.strictEqual(o.stage_counts.in_shop, 1);
    assert.strictEqual(o.stage_counts.done, 1);
    assert.strictEqual(o.stage_counts.quoted, 0);
});

test('access 2 sees prices and open value but not invoices_waiting', async () => {
    const o = await getAdminOverview(seed(), 2, NOW);
    assert.strictEqual(o.jobs[0].parts[0].price, 10);
    assert.strictEqual(o.headline.open_value, 47);
    assert.ok(!('invoices_waiting' in o.headline));
});

test('access 1 sees no prices, open value or invoices_waiting', async () => {
    const o = await getAdminOverview(seed(), 1, NOW);
    assert.ok(!('price' in o.jobs[0].parts[0]));
    assert.ok(!('open_value' in o.headline));
    assert.ok(!('invoices_waiting' in o.headline));
});

test('returns empty structure when nothing is starred', async () => {
    const o = await getAdminOverview(makeShopDb(), 3, NOW);
    assert.deepStrictEqual(o.jobs, []);
    assert.deepStrictEqual(o.contacts, []);
    assert.strictEqual(o.headline.active_parts, 0);
});
