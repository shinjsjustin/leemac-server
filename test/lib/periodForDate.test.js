const { test } = require('node:test');
const assert = require('node:assert');
const { DatabaseSync } = require('node:sqlite');
const { periodIdForDate } = require('../../src/lib/periodForDate');

function makeDb() {
    const sqlite = new DatabaseSync(':memory:');
    sqlite.exec(`
        CREATE TABLE financial_period (id INTEGER PRIMARY KEY, start_date TEXT, end_date TEXT);
        INSERT INTO financial_period (id, start_date, end_date) VALUES
            (7, '2026-07-01', '2026-09-30'),
            (8, '2026-10-01', '2026-12-31'),
            (9, '2026-12-15', '2027-01-15');
    `);
    const calls = [];
    return {
        calls,
        execute: async (sql, params = []) => {
            calls.push({ sql, params });
            return [sqlite.prepare(sql).all(...params).map((r) => ({ ...r }))];
        },
    };
}

test('returns the id of the period holding a YYYY-MM-DD date', async () => {
    assert.strictEqual(await periodIdForDate(makeDb(), '2026-11-14'), 8);
    assert.strictEqual(await periodIdForDate(makeDb(), '2026-09-30'), 7);
    assert.strictEqual(await periodIdForDate(makeDb(), '2026-10-01'), 8);
});

test('accepts a Date and uses its UTC calendar day', async () => {
    assert.strictEqual(await periodIdForDate(makeDb(), new Date('2026-08-02T12:00:00Z')), 7);
});

test('returns null when no period holds the date', async () => {
    assert.strictEqual(await periodIdForDate(makeDb(), '2025-01-01'), null);
});

test('prefers the latest start_date when periods overlap', async () => {
    assert.strictEqual(await periodIdForDate(makeDb(), '2026-12-20'), 9);
});

test('runs a single query with the date bound twice', async () => {
    const db = makeDb();
    await periodIdForDate(db, '2026-11-14');
    assert.strictEqual(db.calls.length, 1);
    assert.deepStrictEqual(db.calls[0].params, ['2026-11-14', '2026-11-14']);
});
