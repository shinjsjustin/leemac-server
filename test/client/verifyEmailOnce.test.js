const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
    path.join(__dirname, '../../src/client/src/components/Authentication/VerifyEmail.js'),
    'utf8'
);

test('VerifyEmail imports useRef from react', () => {
    assert.match(source, /import React,[^;]*\buseRef\b[^;]*from 'react'/);
});

test('VerifyEmail creates a ref with useRef', () => {
    assert.match(source, /const \w+ = useRef\(/);
});

test('effect returns early when the ref already holds the token', () => {
    assert.match(source, /if \((\w+)\.current === token\) return;/);
});

test('ref is set to token before apiFetch is called', () => {
    const set = source.search(/\w+\.current = token;/);
    const call = source.indexOf('await apiFetch(');
    assert.ok(set !== -1, 'ref assignment missing');
    assert.ok(set < call, 'ref must be set before apiFetch');
});
