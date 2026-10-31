const { test } = require('node:test');
const assert = require('node:assert');
const { makeShopDb } = require('../helpers/shopSqliteDb');
const { getPart } = require('../../src/lib/portal');

const COMPANY_A = 1;
const COMPANY_B = 2;
const PART = 9;

function seed(newestLine) {
    const db = makeShopDb();
    db.sqlite.exec(`
        INSERT INTO company (id, name) VALUES (1, 'A'), (2, 'B');
        INSERT INTO part (id, number) VALUES (${PART}, 'P-9');
        INSERT INTO job (id, job_number, company_id, created_at) VALUES
            (10, 'A-old', 1, '2026-01-01 00:00:00'),
            (11, 'A-new', 1, '2026-02-01 00:00:00'),
            (12, 'B-newest', 2, '2026-03-01 00:00:00');
        INSERT INTO job_part (job_id, part_id, quantity, rev, material, finish) VALUES
            (10, ${PART}, 1, 'A', '6061', 'Anodize'),
            (12, ${PART}, 3, 'Z', 'Brass', 'Plate'),
            (11, ${PART}, 2, ${newestLine});
    `);
    return db;
}

test('facts come from the calling company newest line only', async () => {
    const db = seed("'B', '304 SS', 'Passivate'");
    const part = await getPart(db, COMPANY_A, PART);
    assert.deepStrictEqual(part.facts, { rev: 'B', material: '304 SS', finish: 'Passivate' });
    const other = await getPart(db, COMPANY_B, PART);
    assert.deepStrictEqual(other.facts, { rev: 'Z', material: 'Brass', finish: 'Plate' });
});

test('blank facts are null', async () => {
    const db = seed("NULL, '', 'Paint'");
    const part = await getPart(db, COMPANY_A, PART);
    assert.deepStrictEqual(part.facts, { rev: null, material: null, finish: 'Paint' });
});

test('jobs entries keep exactly their four keys', async () => {
    const part = await getPart(seed("'B', 'x', 'y'"), COMPANY_A, PART);
    assert.deepStrictEqual(part.jobs.map((j) => Object.keys(j)), [
        ['id', 'job_number', 'quantity', 'po_date'],
        ['id', 'job_number', 'quantity', 'po_date'],
    ]);
});
