const { test } = require('node:test');
const assert = require('node:assert/strict');
const { makeShopDb } = require('../helpers/shopSqliteDb');
const portal = require('../../src/lib/portal');
const { getOverview } = require('../../src/lib/portalOverview');
const { getSchedule } = require('../../src/lib/portalSchedule');

const NOW = new Date(2026, 5, 10);

async function seed() {
    const db = makeShopDb();
    const run = async (sql, params) => (await db.execute(sql, params))[0].insertId;
    const co = await run('INSERT INTO company (name) VALUES (?)', ['Acme']);
    const job = await run('INSERT INTO job (job_number, company_id, po_date) VALUES (?, ?, ?)', ['J1', co, '2026-06-01']);
    const real = await run('INSERT INTO part (number, description) VALUES (?, ?)', ['P-1', 'Bracket']);
    const fee = await run('INSERT INTO part (number, description) VALUES (?, ?)', ['P-1-03', 'Drawing Fee']);
    const realLine = await run('INSERT INTO job_part (job_id, part_id, quantity) VALUES (?, ?, 4)', [job, real]);
    const feeLine = await run('INSERT INTO job_part (job_id, part_id, quantity, details) VALUES (?, ?, 1, ?)', [job, fee, '*Fee']);
    await run('INSERT INTO stars (job_part_id, status) VALUES (?, ?)', [realLine, 'setup']);
    await run('INSERT INTO stars (job_part_id, status) VALUES (?, ?)', [feeLine, 'setup']);
    return { db, co, job, realLine, feeLine };
}

test('getJob lists a fee line under charges, not parts, with no details key', async () => {
    const { db, co, job, realLine, feeLine } = await seed();
    const result = await portal.getJob(db, co, job, NOW);
    assert.deepEqual(result.parts.map((p) => p.job_part_id), [realLine]);
    assert.deepEqual(result.charges, [
        { job_part_id: feeLine, part_number: 'P-1-03', part_description: 'Drawing Fee', quantity: 1 },
    ]);
    assert.doesNotMatch(JSON.stringify(result), /details|\*Fee/);
});

test('listJobs splits charges from parts', async () => {
    const { db, co, feeLine } = await seed();
    const { jobs } = await portal.listJobs(db, co, {}, NOW);
    assert.equal(jobs[0].parts.length, 1);
    assert.deepEqual(jobs[0].charges.map((c) => c.job_part_id), [feeLine]);
});

test('listParts omits a part whose only lines are charges', async () => {
    const { db, co } = await seed();
    const parts = await portal.listParts(db, co, {});
    assert.deepEqual(parts.map((p) => p.part_number), ['P-1']);
});

test('overview parts list and wall skip charge lines', async () => {
    const { db, co, realLine } = await seed();
    // The test schema has no list or request tables; those sections are not under test.
    const execute = async (sql, params) => (/part_list|quote_request/.test(sql) ? [[]] : db.execute(sql, params));
    const overview = await getOverview({ execute }, { company_id: co, id: 1 }, {}, NOW);
    assert.deepEqual(overview.parts.map((p) => p.part_number), ['P-1']);
    assert.deepEqual(overview.wall.map((w) => w.job_part_id), [realLine]);
    assert.doesNotMatch(JSON.stringify(overview), /details/);
});

test('schedule part_count skips charge lines', async () => {
    const { db, co } = await seed();
    const { board } = await getSchedule(db, { company_id: co }, NOW);
    assert.equal(board[0].part_count, 1);
});
