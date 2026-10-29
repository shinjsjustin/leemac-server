const { test } = require('node:test');
const assert = require('node:assert');
const { makeShopDb } = require('../helpers/shopSqliteDb');
const { changeStarStatus } = require('../../src/lib/starHistory');

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
const status = (db) => db.sqlite.prepare('SELECT status FROM stars WHERE id = 4').get().status;

for (const [name, where, source] of [
    ['jobPartId', { jobPartId: 7 }, 'admin'],
    ['starId', { starId: 4 }, 'admin'],
    ['nfcTagId', { nfcTagId: 'tag-1' }, 'nfc'],
]) {
    test(`changes status and logs one row when found by ${name}`, async () => {
        const db = seed();
        assert.deepStrictEqual(await changeStarStatus(db, where, 'programming', source), { changed: true });
        assert.strictEqual(status(db), 'programming');
        const rows = history(db);
        assert.strictEqual(rows.length, 1);
        assert.deepStrictEqual(
            [rows[0].job_part_id, rows[0].job_id, rows[0].company_id, rows[0].from_status, rows[0].to_status, rows[0].source],
            [7, 3, 10, 'open', 'programming', source]
        );
    });
}

test('logs nothing when the status is unchanged', async () => {
    const db = seed();
    assert.deepStrictEqual(await changeStarStatus(db, { starId: 4 }, 'open', 'admin'), { changed: false });
    assert.strictEqual(history(db).length, 0);
});

test('returns null when no star matches', async () => {
    const db = seed();
    assert.strictEqual(await changeStarStatus(db, { jobPartId: 99 }, 'open', 'admin'), null);
    assert.strictEqual(await changeStarStatus(db, { nfcTagId: 'nope' }, 'open', 'nfc'), null);
    assert.strictEqual(history(db).length, 0);
});
