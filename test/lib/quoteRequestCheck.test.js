const test = require('node:test');
const assert = require('node:assert/strict');
const { makeSqliteDb } = require('../helpers/sqliteDb');
const { searchParts } = require('../../src/lib/partSearch');
const { checkMatches } = require('../../src/lib/quoteRequestReview');

function seed() {
    const db = makeSqliteDb();
    const { sqlite } = db;
    sqlite.exec(`
        INSERT INTO part (number, description) VALUES ('AB-1', 'Bracket'), ('AB-10', 'Long bracket'), ('ZZ-9', 'Plate AB-1 mate');
        INSERT INTO job (job_number, created_at) VALUES ('J1', '2026-01-01');
        INSERT INTO job_part (job_id, part_id, price, quantity, rev, details) VALUES (1, 1, 2.5, 4, 'A', 'x');
        INSERT INTO quote_request (status) VALUES ('sent'), ('draft'), ('sent');
        INSERT INTO quote_request_line (request_id, position, part_number, quantity) VALUES (1, 0, 'stale', 1), (1, 1, NULL, 1), (3, 0, 'other', 1);
    `);
    return db;
}
const snapshot = (db) => JSON.stringify(['part', 'job_part', 'quote_request_line']
    .map((t) => db.sqlite.prepare(`SELECT * FROM ${t}`).all()));
const strip = ({ match, ...part }) => part;

test('Check for one unsaved number equals searchParts with the exact part first as join', async () => {
    const db = seed();
    const before = snapshot(db);
    const [result] = await checkMatches(db, 1, { lines: [{ id: 1, part_number: ' ab-1 ' }] });
    const expected = await searchParts(db, 'ab-1');
    assert.equal(result.line_id, 1);
    assert.equal(result.part_number, 'ab-1');
    assert.deepEqual(result.matches.map(strip), expected);
    assert.deepEqual(result.matches.map((m) => m.match), ['join', 'similar', 'similar']);
    assert.equal(result.matches[0].number, 'AB-1');
    assert.equal(result.matches[0].history[0].job_number, 'J1');
    assert.equal(snapshot(db), before);
});

test('Check puts the join part first even when search order differs', async () => {
    const db = seed();
    const [result] = await checkMatches(db, 1, { lines: [{ id: 1, part_number: 'AB-10' }] });
    assert.deepEqual(result.matches.map((m) => [m.number, m.match]), [['AB-10', 'join']]);
    const [spaced] = await checkMatches(db, 1, { lines: [{ id: 1, part_number: 'ab - 1' }] });
    assert.equal(spaced.matches[0].number, 'AB-1');
    assert.equal(spaced.matches[0].match, 'join');
});

test('Check skips blank numbers and returns an empty match list for an unknown number', async () => {
    const db = seed();
    const result = await checkMatches(db, 1, { lines: [{ id: 1, part_number: '  ' }, { id: 2, part_number: null }, { id: 2, part_number: 'nope' }] });
    assert.deepEqual(result, [{ line_id: 2, part_number: 'nope', matches: [] }]);
});

test('Check rejects a foreign line id and a non-array body, and returns null for a draft or missing request', async () => {
    const db = seed();
    await assert.rejects(checkMatches(db, 1, { lines: [{ id: 3, part_number: 'x' }] }),
        (e) => e.status === 400 && e.message === 'Line does not belong to this request.');
    await assert.rejects(checkMatches(db, 1, {}), (e) => e.status === 400 && e.message === 'lines must be an array.');
    assert.equal(await checkMatches(db, 2, { lines: [] }), null);
    assert.equal(await checkMatches(db, 99, { lines: [] }), null);
});
