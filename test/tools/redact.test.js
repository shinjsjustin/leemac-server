const test = require('node:test');
const assert = require('node:assert');
const { redactRegion } = require('../../tools/guide-shots/redact');

const SIZE = 48;
const px = (png, x, y) => Array.from(png.data.slice((y * png.width + x) * 4, (y * png.width + x) * 4 + 4));

// Black and white checkerboard, one pixel squares: the sharpest pattern there is.
const checker = () => {
  const data = Buffer.alloc(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const v = (x + y) % 2 ? 255 : 0;
      data.set([v, v, v, 255], (y * SIZE + x) * 4);
    }
  }
  return { width: SIZE, height: SIZE, data };
};

test('blur mode destroys a sharp pattern inside the region and leaves outside untouched', () => {
  const png = checker();
  const before = Buffer.from(png.data);
  redactRegion(png, { x: 12, y: 12, width: 24, height: 24, mode: 'blur' });

  for (let y = 12; y < 36; y++) {
    for (let x = 12; x < 35; x++) {
      const a = px(png, x, y)[0];
      const b = px(png, x + 1, y)[0];
      assert.ok(Math.abs(a - b) < 128, `edge survives at ${x},${y}`);
    }
  }
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (x >= 12 && x < 36 && y >= 12 && y < 36) continue;
      const i = (y * SIZE + x) * 4;
      assert.deepStrictEqual(png.data.slice(i, i + 4), before.slice(i, i + 4));
    }
  }
});

test('fill mode paints the region flat #e6e3dc', () => {
  const png = checker();
  redactRegion(png, { x: 4, y: 6, width: 10, height: 8, mode: 'fill' });
  for (let y = 6; y < 14; y++) {
    for (let x = 4; x < 14; x++) assert.deepStrictEqual(px(png, x, y), [0xe6, 0xe3, 0xdc, 255]);
  }
  assert.deepStrictEqual(px(png, 14, 6), (x => [x, x, x, 255])((14 + 6) % 2 ? 255 : 0));
});

test('region extending past the image is clamped, not thrown on', () => {
  const png = checker();
  redactRegion(png, { x: 40, y: 40, width: 100, height: 100, mode: 'fill' });
  assert.deepStrictEqual(px(png, SIZE - 1, SIZE - 1), [0xe6, 0xe3, 0xdc, 255]);
  assert.deepStrictEqual(px(png, 39, 39), [0, 0, 0, 255].map((_, i) => (i < 3 ? (78 % 2 ? 255 : 0) : 255)));
});

test('region wholly outside the image changes nothing', () => {
  const png = checker();
  const before = Buffer.from(png.data);
  redactRegion(png, { x: 500, y: 500, width: 10, height: 10, mode: 'blur' });
  redactRegion(png, { x: -30, y: -30, width: 10, height: 10, mode: 'fill' });
  assert.ok(png.data.equals(before));
});
