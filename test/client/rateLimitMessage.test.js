const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const file = path.join(__dirname, '../../src/client/src/api/apiFetch.js');

let tooManyAttemptsMessage;
test.before(async () => {
    ({ tooManyAttemptsMessage } = await import(pathToFileURL(file).href));
});

const LATER = 'Too many attempts. Try again later.';
const cases = [
    ['Retry-After 600', { 'Retry-After': '600' }, 'Too many attempts. Try again in 10 minutes.'],
    ['Retry-After 601 rounds up', { 'Retry-After': '601' }, 'Too many attempts. Try again in 11 minutes.'],
    ['Retry-After 30 is one minute', { 'Retry-After': '30' }, 'Too many attempts. Try again in 1 minute.'],
    ['Retry-After 0 falls back to RateLimit-Reset', { 'Retry-After': '0', 'RateLimit-Reset': '120' }, 'Too many attempts. Try again in 2 minutes.'],
    ['missing Retry-After falls back to RateLimit-Reset', { 'RateLimit-Reset': '61' }, 'Too many attempts. Try again in 2 minutes.'],
    ['Retry-After wins over RateLimit-Reset', { 'Retry-After': '60', 'RateLimit-Reset': '900' }, 'Too many attempts. Try again in 1 minute.'],
    ['no headers', {}, LATER],
    ['both zero', { 'Retry-After': '0', 'RateLimit-Reset': '0' }, LATER],
    ['non-numeric headers', { 'Retry-After': 'soon', 'RateLimit-Reset': 'abc' }, LATER],
];

for (const [name, headers, expected] of cases) {
    test(`tooManyAttemptsMessage: ${name}`, () => {
        const response = new Response(null, { status: 429, headers });
        assert.strictEqual(tooManyAttemptsMessage(response), expected);
    });
}
