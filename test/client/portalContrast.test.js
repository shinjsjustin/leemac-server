const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '../../src/client/src/index.css'), 'utf8');

function token(name) {
  const match = css.match(new RegExp(`--portal-${name}:\\s*(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3})\\s*;`));
  assert.ok(match, `--portal-${name} must be defined as a hex value`);
  let hex = match[1].slice(1);
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
}

function luminance([r, g, b]) {
  const [R, G, B] = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

function contrast(a, b) {
  const [hi, lo] = [luminance(token(a)), luminance(token(b))].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const TEXT_PAIRS = [
  ['text', 'bg'],
  ['text', 'surface'],
  ['text-muted', 'bg'],
  ['text-muted', 'surface'],
  ['accent', 'surface'],
  ['accent', 'bg'],
  ['on-accent', 'accent'],
  ['on-accent', 'accent-hover'],
  ['badge-text', 'badge-bg'],
];

for (const [fg, bg] of TEXT_PAIRS) {
  test(`portal ${fg} on ${bg} meets WCAG AA 4.5`, () => {
    assert.ok(contrast(fg, bg) >= 4.5, `ratio ${contrast(fg, bg).toFixed(2)}`);
  });
}

test('portal focus on surface meets 3:1', () => {
  assert.ok(contrast('focus', 'surface') >= 3);
});

test('portal border token is defined', () => {
  token('border');
});
