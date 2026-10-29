const { test } = require('node:test');
const assert = require('node:assert');
const { makeSqliteDb } = require('../helpers/sqliteDb');
const { searchParts, findExactParts, numberKey, pickJoinPart, EXACT_PARTS_SQL } = require('../../src/lib/partSearch');

async function seed() {
    const db = makeSqliteDb();
    await db.execute("INSERT INTO part (number, description) VALUES ('ABC123', 'Hex Bracket')");
    await db.execute("INSERT INTO part (number, description) VALUES ('XYZ-9', 'Plate')");
    await db.execute("INSERT INTO job (job_number, created_at) VALUES ('100', '2024-01-01')");
    await db.execute("INSERT INTO job (job_number, created_at) VALUES ('200', '2025-01-01')");
    await db.execute('INSERT INTO job_part (job_id, part_id, price, quantity, rev, details, material, finish) VALUES (1, 1, 5, 10, ?, ?, ?, ?)', ['A', 'old', '6061', 'anodize']);
    await db.execute('INSERT INTO job_part (job_id, part_id, price, quantity, rev, details) VALUES (2, 1, 6, 20, ?, ?)', ['B', 'new']);
    return db;
}

test('searchParts matches partial number case-insensitively with history newest first', async () => {
    const res = await searchParts(await seed(), 'bc1');
    assert.deepStrictEqual(res, [{
        id: 1, number: 'ABC123', description: 'Hex Bracket',
        history: [
            { price: 6, quantity: 20, rev: 'B', details: 'new', material: null, finish: null, job_number: '200', created_at: '2025-01-01' },
            { price: 5, quantity: 10, rev: 'A', details: 'old', material: '6061', finish: 'anodize', job_number: '100', created_at: '2024-01-01' },
        ],
    }]);
});

test('findExactParts history carries material and finish, null when NULL', async () => {
    const res = await findExactParts(await seed(), 'ABC123');
    assert.deepStrictEqual(res[0].history.map((h) => [h.material, h.finish]), [[null, null], ['6061', 'anodize']]);
});

test('searchParts matches description and returns empty history without jobs', async () => {
    const res = await searchParts(await seed(), 'PLATE');
    assert.deepStrictEqual(res, [{ id: 2, number: 'XYZ-9', description: 'Plate', history: [] }]);
});

test('searchParts returns nothing when no part matches', async () => {
    assert.deepStrictEqual(await searchParts(await seed(), 'nope'), []);
});

test('numberKey lowercases and removes spaces', () => {
    assert.strictEqual(numberKey('ABC 123'), 'abc123');
});

test('findExactParts matches ignoring spaces and case, not partial', async () => {
    const db = await seed();
    const res = await findExactParts(db, 'ABC 123');
    assert.strictEqual(res.length, 1);
    assert.strictEqual(res[0].number, 'ABC123');
    assert.strictEqual(res[0].history.length, 2);
    assert.deepStrictEqual(await findExactParts(db, 'abc'), []);
    assert.match(EXACT_PARTS_SQL, /LOWER\(REPLACE\(p\.number, ' ', ''\)\) = \?/);
});

test('pickJoinPart prefers the trim-and-case-equal part, else lowest id, else null', () => {
    const parts = [{ id: 7, number: 'AB 1' }, { id: 3, number: 'ab1' }, { id: 5, number: 'ab 1' }];
    assert.strictEqual(pickJoinPart(' AB 1 ', parts).id, 7);
    assert.strictEqual(pickJoinPart('zzz', parts).id, 3);
    assert.strictEqual(pickJoinPart('zzz', []), null);
});
