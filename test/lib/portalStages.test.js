const { test } = require('node:test');
const assert = require('node:assert/strict');
const { makeShopDb } = require('../helpers/shopSqliteDb');
const portal = require('../../src/lib/portal');

const NOW = new Date(2026, 5, 10);
const RAW_STATUS = /running_machine|setup|\bqa\b|deburr_clean|checking_stock/;

async function seedJob(db, { due = null, ship = null, invoice = null, parts = [] }) {
    const co = (await db.execute('INSERT INTO company (name) VALUES (?)', ['Acme']))[0].insertId;
    const job = (await db.execute(
        'INSERT INTO job (job_number, company_id, due_date, ship_date, invoice_date, invoice_number) VALUES (?, ?, ?, ?, ?, ?)',
        ['J1', co, due, ship, invoice, invoice ? 'INV-9' : null]
    ))[0].insertId;
    const part = (await db.execute('INSERT INTO part (number, description) VALUES (?, ?)', ['P-1', 'Bracket']))[0].insertId;
    for (const p of parts) {
        const jp = (await db.execute(
            'INSERT INTO job_part (job_id, part_id, quantity, material, finish) VALUES (?, ?, 1, ?, ?)',
            [job, part, p.material ?? null, p.finish ?? null]
        ))[0].insertId;
        if (p.status) await db.execute('INSERT INTO stars (job_part_id, status) VALUES (?, ?)', [jp, p.status]);
    }
    return { co, job };
}

test('job stage is the earliest part stage in client words, with an overdue flag', async () => {
    const db = makeShopDb();
    const { co } = await seedJob(db, {
        due: '2026-06-01',
        parts: [{ status: 'qa' }, { status: 'running_machine_a' }],
    });
    const { jobs } = await portal.listJobs(db, co, {}, NOW);
    assert.deepEqual(jobs[0].stage, { key: 'machining', label: 'Machining' });
    assert.equal(jobs[0].flag, 'overdue');
    assert.equal(jobs[0].status, 'open');
});

test('getJob gives due_soon, and parts carry stage, material and finish but no raw status', async () => {
    const db = makeShopDb();
    const { co, job } = await seedJob(db, {
        due: '2026-06-15',
        parts: [{ status: 'setup', material: '6061', finish: 'Anodize' }, { material: null }],
    });
    const result = await portal.getJob(db, co, job, NOW);
    assert.equal(result.flag, 'due_soon');
    assert.deepEqual(result.parts[0].stage, { key: 'preparing', label: 'Preparing' });
    assert.equal(result.parts[0].material, '6061');
    assert.equal(result.parts[0].finish, 'Anodize');
    assert.equal(result.parts[1].stage, null);
    assert.equal('status' in result.parts[0], false);
    assert.doesNotMatch(JSON.stringify(result), RAW_STATUS);
    assert.doesNotMatch(JSON.stringify(result), /INV-9|invoice/);
});

test('unstarred jobs fall back to open, shipped or invoiced stages and keep status open or shipped', async () => {
    const cases = [
        [{ due: '2026-09-01' }, 'open', 'open', null],
        [{ ship: '2026-06-01', due: '2026-06-01' }, 'shipped', 'shipped', null],
        [{ ship: '2026-06-01', invoice: '2026-06-05' }, 'invoiced', 'shipped', null],
    ];
    for (const [opts, stageKey, status, flag] of cases) {
        const db = makeShopDb();
        const { co } = await seedJob(db, { ...opts, parts: [{}] });
        const { jobs } = await portal.listJobs(db, co, {}, NOW);
        assert.equal(jobs[0].stage.key, stageKey);
        assert.equal(typeof jobs[0].stage.label, 'string');
        assert.equal(jobs[0].status, status);
        assert.equal(jobs[0].flag, flag);
        assert.equal('invoice_date' in jobs[0], false);
    }
});
