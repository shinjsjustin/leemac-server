const { test } = require('node:test');
const assert = require('node:assert');
const { makeShopDb } = require('../helpers/shopSqliteDb');
const { setStarFlag, changeStarStatus } = require('../../src/lib/starHistory');
const { getTicker } = require('../../src/lib/portalSchedule');

function seed() {
    const db = makeShopDb();
    db.sqlite.exec(`
        INSERT INTO company (id, name) VALUES (10, 'Acme');
        INSERT INTO job (id, company_id, job_number) VALUES (3, 10, 'J-1');
        INSERT INTO job_part (id, job_id) VALUES (7, 3);
        INSERT INTO stars (id, job_part_id, status, nfc_tag_id) VALUES (4, 7, 'open', 'tag-1');
    `);
    return db;
}
const history = (db) => db.sqlite.prepare('SELECT * FROM star_status_history').all().map((r) => ({ ...r }));
const flag = (db, f) => Number(db.sqlite.prepare(`SELECT ${f} AS v FROM stars WHERE id = 4`).get().v);

for (const [f, where] of [
    ['urgent', { jobPartId: 7 }],
    ['waiting', { starId: 4 }],
    ['urgent', { nfcTagId: 'tag-1' }],
]) {
    test(`sets ${f} and logs one ${f} row found by ${Object.keys(where)[0]}`, async () => {
        const db = seed();
        assert.deepStrictEqual(await setStarFlag(db, where, f, true, 'admin'), { changed: true });
        assert.strictEqual(flag(db, f), 1);
        const rows = history(db);
        assert.strictEqual(rows.length, 1);
        assert.deepStrictEqual(
            [rows[0].kind, rows[0].job_part_id, rows[0].job_id, rows[0].company_id, rows[0].from_status, rows[0].to_status, rows[0].source],
            [f, 7, 3, 10, '0', '1', 'admin']
        );
    });
}

test('clearing a set flag logs 1 to 0', async () => {
    const db = seed();
    await setStarFlag(db, { starId: 4 }, 'waiting', true, 'admin');
    assert.deepStrictEqual(await setStarFlag(db, { starId: 4 }, 'waiting', false, 'admin'), { changed: true });
    assert.strictEqual(flag(db, 'waiting'), 0);
    const last = history(db)[1];
    assert.deepStrictEqual([last.from_status, last.to_status], ['1', '0']);
});

test('returns changed false and logs nothing when flag already has that value', async () => {
    const db = seed();
    assert.deepStrictEqual(await setStarFlag(db, { starId: 4 }, 'urgent', false, 'admin'), { changed: false });
    assert.strictEqual(history(db).length, 0);
});

test('returns null when no star matches', async () => {
    const db = seed();
    assert.strictEqual(await setStarFlag(db, { starId: 99 }, 'urgent', true, 'admin'), null);
    assert.strictEqual(history(db).length, 0);
});

test('throws for any other flag and changes nothing', async () => {
    const db = seed();
    await assert.rejects(() => setStarFlag(db, { starId: 4 }, 'status', true, 'admin'), Error);
    await assert.rejects(() => setStarFlag(db, { starId: 4 }, 'id; DROP', true, 'admin'), Error);
    assert.strictEqual(history(db).length, 0);
});

test('changeStarStatus logs kind status', async () => {
    const db = seed();
    await changeStarStatus(db, { starId: 4 }, 'programming', 'admin');
    assert.strictEqual(history(db)[0].kind, 'status');
});

test('ticker ignores flag changes but shows status changes', async () => {
    const db = seed();
    const now = new Date();
    await setStarFlag(db, { starId: 4 }, 'urgent', true, 'admin');
    assert.deepStrictEqual(await getTicker(db, { company_id: 10 }, now), []);
    await changeStarStatus(db, { starId: 4 }, 'complete', 'admin');
    assert.strictEqual((await getTicker(db, { company_id: 10 }, now)).length, 1);
});
