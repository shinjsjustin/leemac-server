const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { PNG } = require('pngjs');

const REGIONS = path.join(__dirname, '..', '..', 'tools', 'guide-shots', 'regions.json');
const SHOTS = path.join(__dirname, '..', '..', 'src', 'client', 'src', 'components', 'ClientComponents', 'guide', 'shots');
const SHOT_COUNT = 18;

const regions = JSON.parse(fs.readFileSync(REGIONS, 'utf8'));

test('regions.json names all draft shots, each with at least one region', () => {
  const entries = Object.entries(regions);
  assert.strictEqual(entries.length, SHOT_COUNT);
  for (const [file, list] of entries) {
    assert.ok(Array.isArray(list) && list.length > 0, `${file} has no regions`);
  }
});

for (const [file, list] of Object.entries(regions)) {
  test(`${file} has a committed PNG and every region lies within it`, () => {
    const target = path.join(SHOTS, file);
    assert.ok(fs.existsSync(target), `missing ${target}`);
    const png = PNG.sync.read(fs.readFileSync(target));
    for (const { x, y, width, height, mode } of list) {
      assert.ok(Number.isInteger(x) && Number.isInteger(y), `${file} non-integer origin`);
      assert.ok(width > 0 && height > 0, `${file} empty region`);
      assert.ok(x >= 0 && y >= 0, `${file} region starts outside`);
      assert.ok(x + width <= png.width, `${file} region exceeds width ${png.width}`);
      assert.ok(y + height <= png.height, `${file} region exceeds height ${png.height}`);
      assert.ok(mode === undefined || mode === 'blur' || mode === 'fill', `${file} bad mode ${mode}`);
    }
  });
}
