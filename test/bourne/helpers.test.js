const { test } = require('node:test');
const assert = require('node:assert');
const {
    BadQuery, parseInteger, parsePaging, groupBy, fileMeta, selectIn,
} = require('../../src/lib/bourne/helpers');
const { makeFakeDb } = require('../helpers/fakeDb');

test('parseInteger returns numbers and throws BadQuery otherwise', () => {
    assert.strictEqual(parseInteger('0', 'x'), 0);
    assert.strictEqual(parseInteger('42', 'x'), 42);
    for (const bad of ['-1', '1.5', 'abc', '', '1e3']) {
        assert.throws(() => parseInteger(bad, 'x'), BadQuery, bad);
    }
    assert.throws(() => parseInteger('a', 'limit'), /limit must be a non-negative integer/);
});

test('parsePaging defaults to 50/0 and clamps limit to 1..200', () => {
    assert.deepStrictEqual(parsePaging({}), { limit: 50, offset: 0 });
    assert.deepStrictEqual(parsePaging({ limit: '0' }), { limit: 1, offset: 0 });
    assert.deepStrictEqual(parsePaging({ limit: '999', offset: '7' }), { limit: 200, offset: 7 });
    assert.deepStrictEqual(parsePaging({ limit: '10', offset: '3' }), { limit: 10, offset: 3 });
    assert.throws(() => parsePaging({ limit: 'x' }), BadQuery);
    assert.throws(() => parsePaging({ offset: '-2' }), BadQuery);
});

test('groupBy groups rows by key preserving order', () => {
    const rows = [{ k: 1, v: 'a' }, { k: 2, v: 'b' }, { k: 1, v: 'c' }];
    const groups = groupBy(rows, 'k');
    assert.deepStrictEqual([...groups.keys()], [1, 2]);
    assert.deepStrictEqual(groups.get(1).map((r) => r.v), ['a', 'c']);
});

test('fileMeta keeps only metadata fields', () => {
    const row = { id: 1, filename: 'a.pdf', mimetype: 'application/pdf', size: 9, uploaded_at: 't', content: 'SECRET', part_id: 3 };
    assert.deepStrictEqual(fileMeta(row), {
        id: 1, filename: 'a.pdf', mimetype: 'application/pdf', size: 9, uploaded_at: 't',
    });
});

test('selectIn expands placeholders and skips the query for no ids', async () => {
    const db = makeFakeDb([{ match: /IN/, rows: [{ id: 1 }] }]);
    assert.deepStrictEqual(await selectIn(db, 'SELECT id FROM t WHERE id IN (?)', []), []);
    assert.strictEqual(db.calls.length, 0);
    assert.deepStrictEqual(await selectIn(db, 'SELECT id FROM t WHERE id IN (?)', [4, 5, 6]), [{ id: 1 }]);
    assert.strictEqual(db.calls[0].sql, 'SELECT id FROM t WHERE id IN (?, ?, ?)');
    assert.deepStrictEqual(db.calls[0].params, [4, 5, 6]);
});
