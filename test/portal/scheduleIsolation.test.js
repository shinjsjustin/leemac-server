const { test } = require('node:test');
const assert = require('node:assert');
const { makeShopDb } = require('../helpers/shopSqliteDb');
const { getSchedule, getTicker } = require('../../src/lib/portalSchedule');

const NOW = new Date(2026, 2, 18, 12, 0, 0);
const USER = { company_id: 1 };

function seed() {
    const db = makeShopDb();
    db.sqlite.exec(`
        INSERT INTO company (id, name) VALUES (1, 'Mine'), (2, 'SecretCo');
        INSERT INTO part (id, number, description) VALUES (1, 'SECRET-PART', 'SECRET-DESC');
        INSERT INTO job (id, job_number, company_id, po_number, po_date, due_date, created_at, attention, invoice_number)
            VALUES (20, 'A-1', 2, 'SECRET-PO', '2026-03-10', '2026-03-12', '2026-03-09 08:00:00', 'SECRET-ATTN', 'SECRET-INV');
        INSERT INTO job_part (id, job_id, part_id, price, quantity, note) VALUES (200, 20, 1, 987.65, 4, 'SECRET-NOTE');
        INSERT INTO stars (job_part_id, status, attention, nfc_tag_id) VALUES (200, 'running_machine_d', 'SECRET-STAR-ATTN', 'SECRET-TAG');
        INSERT INTO star_status_history (job_part_id, job_id, company_id, from_status, to_status, source, changed_at)
            VALUES (200, 20, 2, 'setup', 'running_machine_d', 'nfc', '2026-03-17 10:00:00');
    `);
    return db;
}

test('other companies appear on the board with exactly job_number, stage, part_count, created_at, due_date', async () => {
    const { board, timeline } = await getSchedule(seed(), USER, NOW);
    assert.deepStrictEqual(timeline, []);
    assert.deepStrictEqual(board, [{ job_number: 'A-1', stage: { key: 'machining', label: 'Machining' }, part_count: 1, created_at: '2026-03-09 08:00:00', due_date: '2026-03-12' }]);
    assert.ok(!/SECRET|987|machine_d/.test(JSON.stringify(board)));
});

test('other companies appear in the ticker with exactly at, job_number, stage', async () => {
    const events = await getTicker(seed(), USER, NOW);
    assert.deepStrictEqual(events, [{ at: '2026-03-17 10:00:00', job_number: 'A-1', stage: { key: 'machining', label: 'Machining' } }]);
    assert.ok(!/SECRET|machine_d|nfc/.test(JSON.stringify(events)));
});
