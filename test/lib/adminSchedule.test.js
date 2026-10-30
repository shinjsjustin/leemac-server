const { test } = require('node:test');
const assert = require('node:assert');
const { makeShopDb } = require('../helpers/shopSqliteDb');
const { getAdminSchedule } = require('../../src/lib/adminSchedule');
const { getSchedule } = require('../../src/lib/portalSchedule');

// Wednesday 2026-03-18: window 2026-03-09 .. 2026-04-06.
const NOW = new Date(2026, 2, 18, 12, 0, 0);

function seed() {
    const db = makeShopDb();
    db.sqlite.exec(`
        INSERT INTO company (id, name) VALUES (1, 'Acme'), (2, 'Bolt');
        INSERT INTO part (id, number) VALUES (1, 'P-1'), (2, 'P-2');
        INSERT INTO job (id, job_number, company_id, due_date, created_at) VALUES (10, 'M-2', 1, '2026-03-15', '2026-01-01 00:00:00');
        INSERT INTO job_part (id, job_id, part_id, price) VALUES (100, 10, 1, 5), (101, 10, 2, 6);
        INSERT INTO stars (job_part_id, status) VALUES (100, 'running_machine_a'), (101, 'qa');
        INSERT INTO job (id, job_number, company_id, due_date, created_at) VALUES (20, 'A-1', 2, '2026-03-20', '2026-03-05 09:30:00');
        INSERT INTO job_part (id, job_id, part_id) VALUES (200, 20, 1);
        INSERT INTO stars (job_part_id, status) VALUES (200, 'setup');
        INSERT INTO job (id, job_number, company_id) VALUES (21, 'A-NOSTAR', 2);
        INSERT INTO job_part (id, job_id, part_id) VALUES (210, 21, 1);
        INSERT INTO job (id, job_number, company_id, ship_date) VALUES (30, 'U-2', 2, '2026-03-01');
        INSERT INTO job_part (id, job_id, part_id) VALUES (300, 30, 1);
        INSERT INTO stars (job_part_id, status) VALUES (300, 'setup');
        INSERT INTO job (id, job_number, company_id) VALUES (31, 'U-1', 1);
        INSERT INTO job_part (id, job_id, part_id) VALUES (310, 31, 1);
        INSERT INTO stars (job_part_id, status) VALUES (310, 'setup');
    `);
    return db;
}

test('getAdminSchedule window matches getSchedule for the same now', async () => {
    const db = seed();
    const admin = await getAdminSchedule(db, NOW);
    const client = await getSchedule(db, { company_id: 1 }, NOW);
    assert.deepStrictEqual(admin.window, client.window);
    assert.deepStrictEqual(admin.window, { start: '2026-03-09', end: '2026-04-06' });
});

test('getAdminSchedule board lists every starred job from any company by stage then job number, with company name and no money', async () => {
    const { board } = await getAdminSchedule(seed(), NOW);
    const prep = { key: 'preparing', label: 'Preparing' };
    assert.deepStrictEqual(board, [
        { id: 20, job_number: 'A-1', company_name: 'Bolt', stage: prep, part_count: 1, created_at: '2026-03-05 09:30:00', due_date: '2026-03-20', flag: 'due_soon', own: true },
        { id: 31, job_number: 'U-1', company_name: 'Acme', stage: prep, part_count: 1, created_at: board[1].created_at ?? null, due_date: null, flag: null, own: true },
        { id: 30, job_number: 'U-2', company_name: 'Bolt', stage: prep, part_count: 1, created_at: board[2].created_at ?? null, due_date: null, flag: null, own: true },
        { id: 10, job_number: 'M-2', company_name: 'Acme', stage: { key: 'machining', label: 'Machining' }, part_count: 2, created_at: '2026-01-01 00:00:00', due_date: '2026-03-15', flag: 'overdue', own: true },
    ]);
    for (const e of board) assert.ok(!Object.keys(e).some((k) => /price|cost/.test(k)));
});

test('getAdminSchedule undated holds starred jobs with no due or ship date, by job number', async () => {
    const { undated } = await getAdminSchedule(seed(), NOW);
    assert.deepStrictEqual(undated, [
        { id: 31, job_number: 'U-1', company_name: 'Acme', stage: { key: 'preparing', label: 'Preparing' } },
    ]);
});

test('getAdminSchedule excludes unstarred jobs from board and undated', async () => {
    const { board, undated } = await getAdminSchedule(seed(), NOW);
    assert.ok(![...board, ...undated].some((j) => j.job_number === 'A-NOSTAR'));
});
