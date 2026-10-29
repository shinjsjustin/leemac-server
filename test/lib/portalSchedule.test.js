const { test } = require('node:test');
const assert = require('node:assert');
const { makeShopDb } = require('../helpers/shopSqliteDb');
const { getSchedule, getTicker } = require('../../src/lib/portalSchedule');

// Wednesday 2026-03-18: Monday of last week is 2026-03-09, window end 2026-04-06.
const NOW = new Date(2026, 2, 18, 12, 0, 0);
const USER = { company_id: 1 };

function seed() {
    const db = makeShopDb();
    db.sqlite.exec(`
        INSERT INTO company (id, name) VALUES (1, 'Mine'), (2, 'Other');
        INSERT INTO part (id, number) VALUES (1, 'P-1'), (2, 'P-2');
        -- own: in window via po_date, starred machining, due in the past
        INSERT INTO job (id, job_number, company_id, po_date, due_date, created_at) VALUES (10, 'M-2', 1, '2026-03-10', '2026-03-15', '2026-01-01 00:00:00');
        INSERT INTO job_part (id, job_id, part_id) VALUES (100, 10, 1), (101, 10, 2);
        INSERT INTO stars (job_part_id, status) VALUES (100, 'running_machine_a'), (101, 'qa');
        -- own: no po_date, created_at used; no stars; shipped long before window -> excluded
        INSERT INTO job (id, job_number, company_id, due_date, ship_date, created_at) VALUES (11, 'M-OLD', 1, '2025-12-01', '2025-12-02', '2025-11-01 00:00:00');
        -- own: starts after window -> excluded
        INSERT INTO job (id, job_number, company_id, po_date, due_date) VALUES (12, 'M-FUT', 1, '2026-04-07', '2026-05-01');
        -- own: created_at fallback, no stars, due in 3 days
        INSERT INTO job (id, job_number, company_id, due_date, created_at) VALUES (13, 'M-1', 1, '2026-03-21', '2026-03-12 08:00:00');
        -- other company, starred
        INSERT INTO job (id, job_number, company_id, due_date) VALUES (20, 'A-1', 2, '2026-03-20');
        INSERT INTO job_part (id, job_id, part_id) VALUES (200, 20, 1), (201, 20, 2);
        INSERT INTO stars (job_part_id, status) VALUES (200, 'setup');
        -- other company, unstarred -> not on board
        INSERT INTO job (id, job_number, company_id) VALUES (21, 'A-NOSTAR', 2);
        INSERT INTO job_part (id, job_id, part_id) VALUES (210, 21, 1);
    `);
    return db;
}

test('getSchedule window is Monday of last week through 28 days later', async () => {
    const { window } = await getSchedule(seed(), USER, NOW);
    assert.deepStrictEqual(window, { start: '2026-03-09', end: '2026-04-06' });
});

test('getSchedule timeline holds only own overlapping jobs with start fallback, stage and flag', async () => {
    const { timeline } = await getSchedule(seed(), USER, NOW);
    assert.deepStrictEqual(timeline.map((t) => t.job_number).sort(), ['M-1', 'M-2']);
    const m2 = timeline.find((t) => t.job_number === 'M-2');
    assert.strictEqual(m2.id, 10);
    assert.strictEqual(String(m2.start).slice(0, 10), '2026-03-10');
    assert.strictEqual(m2.stage, 'machining');
    assert.strictEqual(m2.flag, 'overdue');
    assert.deepStrictEqual(Object.keys(m2).sort(), ['due_date', 'flag', 'id', 'job_number', 'ship_date', 'stage', 'start']);
    const m1 = timeline.find((t) => t.job_number === 'M-1');
    assert.strictEqual(String(m1.start).slice(0, 10), '2026-03-12');
    assert.strictEqual(m1.stage, 'open');
    assert.strictEqual(m1.flag, 'due_soon');
});

test('getSchedule board lists every starred job ordered by stage then job number', async () => {
    const { board } = await getSchedule(seed(), USER, NOW);
    assert.deepStrictEqual(board, [
        { job_number: 'A-1', stage: 'preparing', part_count: 2 },
        { id: 10, job_number: 'M-2', stage: 'machining', part_count: 2, flag: 'overdue', own: true },
    ]);
});

function seedHistory(rows) {
    const db = seed();
    const stmt = db.sqlite.prepare(
        `INSERT INTO star_status_history (job_part_id, job_id, company_id, from_status, to_status, source, changed_at)
         VALUES (?, ?, ?, ?, ?, 'admin', ?)`
    );
    for (const r of rows) stmt.run(...r);
    return db;
}

test('getTicker returns newest first, skips same-stage moves and old events', async () => {
    const db = seedHistory([
        [100, 10, 1, 'open', 'setup', '2026-03-17 09:00:00'],
        [200, 20, 2, 'programming', 'setup', '2026-03-17 10:00:00'], // same stage
        [200, 20, 2, 'setup', 'qa', '2026-03-18 08:00:00'],
        [100, 10, 1, 'open', 'setup', '2026-03-01 09:00:00'], // too old
    ]);
    assert.deepStrictEqual(await getTicker(db, USER, NOW), [
        { at: '2026-03-18 08:00:00', job_number: 'A-1', stage: 'inspection' },
        { at: '2026-03-17 09:00:00', job_number: 'M-2', part_number: 'P-1', stage: 'preparing', own: true },
    ]);
});

test('getTicker returns at most 20 changes', async () => {
    const rows = [];
    for (let i = 0; i < 25; i++) rows.push([200, 20, 2, 'open', 'qa', `2026-03-17 10:${String(i).padStart(2, '0')}:00`]);
    const events = await getTicker(seedHistory(rows), USER, NOW);
    assert.strictEqual(events.length, 20);
    assert.strictEqual(events[0].at, '2026-03-17 10:24:00');
});
