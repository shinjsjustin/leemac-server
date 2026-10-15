const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const root = path.join(__dirname, '..');
const pkg = require(path.join(root, 'package.json'));
const lock = require(path.join(root, 'package-lock.json'));

test('test script runs every test file', () => {
  assert.strictEqual(pkg.scripts.test, "node --test 'test/**/*.test.js'");
});

test('engines requires node 23 or newer', () => {
  assert.strictEqual(pkg.engines.node, '>=23');
});

test('placeholder packages fs and https are not dependencies', () => {
  assert.ok(!('fs' in pkg.dependencies));
  assert.ok(!('https' in pkg.dependencies));
});

test('lockfile has no fs or https packages', () => {
  assert.ok(!('node_modules/fs' in lock.packages));
  assert.ok(!('node_modules/https' in lock.packages));
});
