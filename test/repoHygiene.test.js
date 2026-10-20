const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SKIPPED_DIRS = new Set(['node_modules', path.join(ROOT, 'src', 'client', 'build')]);
const STRAY_SUFFIXES = ['-E', '.orig', '.bak', '~'];

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (SKIPPED_DIRS.has(entry.name) || SKIPPED_DIRS.has(full)) return [];
    return entry.isDirectory() ? walk(full) : [full];
  });
}

test('src and test contain no editor or sed backup files', () => {
  const stray = [path.join(ROOT, 'src'), path.join(ROOT, 'test')]
    .flatMap(walk)
    .filter((file) => STRAY_SUFFIXES.some((suffix) => file.endsWith(suffix)))
    .map((file) => path.relative(ROOT, file));
  assert.deepStrictEqual(stray, []);
});
