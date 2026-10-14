const { test } = require('node:test');
const assert = require('node:assert');
const { pick } = require('../../src/lib/bourne/helpers');

test('pick returns a new object with only the listed keys', () => {
    const row = { id: 1, name: 'a', password: 'x' };
    const picked = pick(row, ['id', 'name']);
    assert.deepStrictEqual(picked, { id: 1, name: 'a' });
    assert.notStrictEqual(picked, row);
    assert.ok('password' in row);
});

test('pick keeps null values and listed order, and sets absent listed keys to undefined', () => {
    const picked = pick({ b: null, a: 0, extra: 1 }, ['a', 'b', 'missing']);
    assert.deepStrictEqual(Object.keys(picked), ['a', 'b', 'missing']);
    assert.strictEqual(picked.b, null);
    assert.strictEqual(picked.a, 0);
    assert.strictEqual(picked.missing, undefined);
});
