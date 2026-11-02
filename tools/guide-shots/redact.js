const fs = require('node:fs');
const path = require('node:path');

const BLOCK = 12;
const BLUR_RADIUS = 6;
const FILL = [0xe6, 0xe3, 0xdc, 255];
const ROOT = path.join(__dirname, '..', '..');
const REGIONS = path.join(__dirname, 'regions.json');
const SOURCE_DIR = path.join(ROOT, 'references', 'user-guide-2026-11-02', 'shots');
const OUTPUT_DIR = path.join(ROOT, 'src', 'client', 'src', 'components', 'ClientComponents', 'guide', 'shots');

const clampRegion = (png, { x, y, width, height }) => {
  const x0 = Math.max(0, x);
  const y0 = Math.max(0, y);
  return {
    x0,
    y0,
    x1: Math.min(png.width, x + width),
    y1: Math.min(png.height, y + height),
  };
};

const averageBlock = (png, bx0, by0, bx1, by1) => {
  const sum = [0, 0, 0, 0];
  for (let y = by0; y < by1; y++) {
    for (let x = bx0; x < bx1; x++) {
      for (let c = 0; c < 4; c++) sum[c] += png.data[(y * png.width + x) * 4 + c];
    }
  }
  const n = (bx1 - bx0) * (by1 - by0);
  return sum.map((s) => Math.round(s / n));
};

const pixelate = (png, { x0, y0, x1, y1 }) => {
  for (let by = y0; by < y1; by += BLOCK) {
    for (let bx = x0; bx < x1; bx += BLOCK) {
      const ex = Math.min(bx + BLOCK, x1);
      const ey = Math.min(by + BLOCK, y1);
      const avg = averageBlock(png, bx, by, ex, ey);
      for (let y = by; y < ey; y++) {
        for (let x = bx; x < ex; x++) png.data.set(avg, (y * png.width + x) * 4);
      }
    }
  }
};

const boxBlur = (png, { x0, y0, x1, y1 }) => {
  const source = Buffer.from(png.data);
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const sum = [0, 0, 0, 0];
      let n = 0;
      for (let sy = Math.max(y0, y - BLUR_RADIUS); sy <= Math.min(y1 - 1, y + BLUR_RADIUS); sy++) {
        for (let sx = Math.max(x0, x - BLUR_RADIUS); sx <= Math.min(x1 - 1, x + BLUR_RADIUS); sx++) {
          for (let c = 0; c < 4; c++) sum[c] += source[(sy * png.width + sx) * 4 + c];
          n++;
        }
      }
      png.data.set(sum.map((s) => Math.round(s / n)), (y * png.width + x) * 4);
    }
  }
};

const fill = (png, { x0, y0, x1, y1 }) => {
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) png.data.set(FILL, (y * png.width + x) * 4);
  }
};

// Mutates png in place; the caller owns the buffer.
function redactRegion(png, region) {
  const bounds = clampRegion(png, region);
  if (bounds.x1 <= bounds.x0 || bounds.y1 <= bounds.y0) return;
  if (region.mode === 'fill') return fill(png, bounds);
  pixelate(png, bounds);
  boxBlur(png, bounds);
}

function run(isCheck) {
  const { PNG } = require('pngjs');
  const regions = JSON.parse(fs.readFileSync(REGIONS, 'utf8'));
  let failed = false;
  for (const [file, list] of Object.entries(regions)) {
    const source = path.join(SOURCE_DIR, file);
    if (!fs.existsSync(source)) {
      console.error(`Original screenshot missing: ${source}`);
      process.exit(1);
    }
    const png = PNG.sync.read(fs.readFileSync(source));
    for (const region of list) redactRegion(png, region);
    const bytes = PNG.sync.write(png);
    const target = path.join(OUTPUT_DIR, file);
    if (!isCheck) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
      fs.writeFileSync(target, bytes);
    } else if (!fs.existsSync(target) || !fs.readFileSync(target).equals(bytes)) {
      console.error(`Out of date or missing: ${target}`);
      failed = true;
    }
  }
  if (failed) process.exit(1);
}

if (require.main === module) run(process.argv.includes('--check'));

module.exports = { redactRegion };
