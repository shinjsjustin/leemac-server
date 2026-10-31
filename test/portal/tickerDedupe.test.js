const { test } = require('node:test');
const assert = require('node:assert');
const { makeShopDb } = require('../helpers/shopSqliteDb');
const { getTicker } = require('../../src/lib/portalSchedule');

const NOW = new Date(2026, 2, 18, 12, 0, 0);
const USER = { company_id: 1 };
const DELIVERED = { key: 'delivered', label: 'Delivered' };

function move(db, partId, jobId, companyId, to, at) {
    db.sqlite.exec(`INSERT INTO star_status_history (job_part_id, job_id, company_id, from_status, to_status, source, changed_at)
        VALUES (${partId}, ${jobId}, ${companyId}, 'setup', '${to}', 'nfc', '${at}')`);
}

function seed() {
    const db = makeShopDb();
    db.sqlite.exec(`
        INSERT INTO company (id, name) VALUES (1, 'Mine'), (2, 'Other');
        INSERT INTO job (id, job_number, company_id) VALUES (20, '13706', 2), (21, 'M-1', 1), (22, '13500', 2);
    `);
    for (let i = 1; i <= 9; i++) {
        db.sqlite.exec(`INSERT INTO part (id, number) VALUES (${i}, 'P-${i}'); INSERT INTO job_part (id, job_id, part_id) VALUES (${i}, ${i <= 7 ? 20 : 21}, ${i});`);
    }
    return db;
}

test('seven parts of another client job moving together make one ticker event', async () => {
    const db = seed();
    for (let i = 1; i <= 7; i++) move(db, i, 20, 2, 'delivered', `2026-03-17 13:00:0${i}`);
    const events = await getTicker(db, USER, NOW);
    assert.deepStrictEqual(events, [{ at: '2026-03-17 13:00:07', job_number: '13706', stage: DELIVERED }]);
});

test('own events keep one line per part', async () => {
    const db = seed();
    move(db, 8, 21, 1, 'delivered', '2026-03-17 13:00:01');
    move(db, 9, 21, 1, 'delivered', '2026-03-17 13:00:02');
    const events = await getTicker(db, USER, NOW);
    assert.deepStrictEqual(events.map((e) => e.part_number), ['P-9', 'P-8']);
});

test('a different minute or job is a separate event', async () => {
    const db = seed();
    move(db, 1, 20, 2, 'delivered', '2026-03-17 13:00:59');
    move(db, 2, 20, 2, 'delivered', '2026-03-17 13:01:00');
    move(db, 3, 22, 2, 'delivered', '2026-03-17 13:01:00');
    const events = await getTicker(db, USER, NOW);
    assert.strictEqual(events.length, 3);
});

test('duplicates are dropped before the 20-event limit', async () => {
    const db = seed();
    for (let i = 0; i < 25; i++) move(db, 1, 20, 2, 'delivered', `2026-03-17 13:00:${String(i).padStart(2, '0')}`);
    move(db, 3, 22, 2, 'delivered', '2026-03-17 09:00:00');
    const events = await getTicker(db, USER, NOW);
    assert.deepStrictEqual(events.map((e) => e.job_number), ['13706', '13500']);
});
