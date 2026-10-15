const { test } = require('node:test');
const assert = require('node:assert');
const { normalizePrice } = require('../../src/lib/price');

test('normalizePrice converts valid values to numbers rounded to 2 decimals', () => {
    const cases = [
        ['12.50', 12.5],
        [12, 12],
        [0, 0],
        ['0', 0],
        [1.234, 1.23],
        ['3.456', 3.46],
    ];
    for (const [input, expected] of cases) {
        assert.strictEqual(normalizePrice(input), expected);
    }
});

test('normalizePrice returns null for null, undefined and empty string', () => {
    for (const input of [null, undefined, '']) {
        assert.strictEqual(normalizePrice(input), null);
    }
});

test('normalizePrice throws for non-numeric, negative and non-finite values', () => {
    for (const input of ['abc', -1, '-0.5', NaN, Infinity, {}, true]) {
        assert.throws(() => normalizePrice(input), Error);
    }
});
