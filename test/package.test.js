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

const installedMajor = (name) =>
  Number(require(path.join(root, 'node_modules', name, 'package.json')).version.split('.')[0]);

test('installed majors stay on express 4 and multer 1', () => {
  assert.strictEqual(installedMajor('express'), 4);
  assert.strictEqual(installedMajor('multer'), 1);
});

test('unused Google and session packages are not dependencies', () => {
  const removed = [
    'express-session',
    'passport',
    'passport-google-oauth20',
    'googleapis',
    'google-auth-library',
    'google-spreadsheet',
  ];
  for (const name of removed) {
    assert.ok(!(name in pkg.dependencies), `${name} is still a dependency`);
  }
});

test('no Maps or Places package is in root or client manifests or lockfiles', () => {
  const MAPS = /googlemaps|google-maps|google-places/i;
  const names = [root, path.join(root, 'src', 'client')].flatMap((dir) => {
    const manifest = require(path.join(dir, 'package.json'));
    const lockfile = require(path.join(dir, 'package-lock.json'));
    return [
      ...Object.keys(manifest.dependencies || {}),
      ...Object.keys(manifest.devDependencies || {}),
      ...Object.keys(lockfile.packages || {}),
      ...Object.keys(lockfile.dependencies || {}),
    ];
  });
  assert.deepStrictEqual(names.filter((name) => MAPS.test(name)), []);
});

test('pngjs is a direct devDependency', () => {
  assert.ok('pngjs' in pkg.devDependencies);
});
