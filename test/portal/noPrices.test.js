const test = require('node:test');
const assert = require('node:assert/strict');
const { makeShopDb } = require('../helpers/shopSqliteDb');
const portal = require('../../src/lib/portal');
const clientPortal = require('../../src/lib/clientPortal');

const PRICE = 987.65;

async function seed() {
    const db = makeShopDb();
    // The shared helper schema lacks the column clientPortal.getJob selects.
    db.sqlite.exec('ALTER TABLE job_part ADD COLUMN stock_size TEXT');
    db.sqlite.exec(`
        INSERT INTO company (id, name) VALUES (1, 'Acme');
        INSERT INTO job (id, job_number, company_id, po_number) VALUES (1, 'J-1', 1, 'PO-1');
        INSERT INTO part (id, number, description) VALUES (1, 'P-1', 'Bracket');
        INSERT INTO job_part (id, job_id, part_id, quantity, price, rev) VALUES (1, 1, 1, 5, ${PRICE}, 'A');
        INSERT INTO stars (job_part_id, status) VALUES (1, 'open');
    `);
    return db;
}

function assertNoPrice(label, result) {
    const json = JSON.stringify(result);
    assert.ok(json.length > 10, `${label} returned data`);
    assert.ok(!json.includes('987.65'), `${label} leaks the price value`);
    assert.ok(!/"(price|unit_price|latest_price)"/.test(json), `${label} has a price key`);
}

test('portal.js results carry no price but keep their other fields', async () => {
    const db = await seed();
    const { jobs } = await portal.listJobs(db, 1);
    assertNoPrice('listJobs', jobs);
    assert.equal(jobs[0].job_number, 'J-1');
    assert.equal(jobs[0].parts[0].quantity, 5);
    assert.equal(jobs[0].parts[0].rev, 'A');
    assert.equal(jobs[0].parts[0].part_number, 'P-1');

    const job = await portal.getJob(db, 1, 1);
    assertNoPrice('getJob', job);
    assert.equal(job.parts[0].part_description, 'Bracket');

    const parts = await portal.listParts(db, 1);
    assertNoPrice('listParts', parts);
    assert.equal(parts[0].latest.quantity, 5);

    const part = await portal.getPart(db, 1, 1);
    assertNoPrice('getPart', part);
    assert.equal(part.part_number, 'P-1');
});

test('clientPortal.js results carry no price but keep their other fields', async () => {
    const db = await seed();
    const starred = await clientPortal.listStarred(db, 1);
    assertNoPrice('listStarred', starred);
    assert.equal(starred[0].quantity, 5);
    assert.equal(starred[0].rev, 'A');

    const { jobs } = await clientPortal.listJobs(db, 1);
    assertNoPrice('listJobs', jobs);
    assert.deepEqual(jobs[0].parts, [{ number: 'P-1', quantity: 5 }]);

    const parts = await clientPortal.listParts(db, 1);
    assertNoPrice('listParts', parts);
    assert.equal(parts[0].latest_quantity, 5);
    assert.equal(parts[0].latest_rev, 'A');

    const job = await clientPortal.getJob(db, 1, 1);
    assertNoPrice('getJob', job);
    assert.equal(job.parts[0].quantity, 5);
    assert.equal(job.parts[0].rev, 'A');

    const part = await clientPortal.getPart(db, 1, 1);
    assertNoPrice('getPart', part);
    assert.equal(part.jobs[0].quantity, 5);
    assert.equal(part.jobs[0].rev, 'A');
});
