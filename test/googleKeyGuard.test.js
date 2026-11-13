const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const GOOGLE_KEY = /AIza[0-9A-Za-z_-]{35}/;

const isBinary = (buffer) => buffer.includes(0);

function filesWithGoogleKey() {
  const listed = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
    cwd: ROOT,
    maxBuffer: 64 * 1024 * 1024,
  })
    .toString()
    .split('\0')
    .filter(Boolean);
  return listed.filter((file) => {
    const full = path.join(ROOT, file);
    if (!fs.existsSync(full)) return false;
    const buffer = fs.readFileSync(full);
    return !isBinary(buffer) && GOOGLE_KEY.test(buffer.toString('utf8'));
  });
}

test('matcher flags a Google API key built at runtime', () => {
  assert.ok(GOOGLE_KEY.test('key=' + 'AIza' + 'x'.repeat(35)));
  assert.ok(!GOOGLE_KEY.test('AIza' + 'x'.repeat(34)));
});

test('no tracked or unignored file holds a Google API key', () => {
  assert.deepStrictEqual(filesWithGoogleKey(), []);
});
