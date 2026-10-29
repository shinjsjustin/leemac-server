const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const css = fs
  .readFileSync(path.join(__dirname, '../../src/client/src/components/Styling/PortalOverview.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '');

// Body of the first `.portal-shell .portal-overview {}` rule inside the min-width: 1200px media block.
function wideRule() {
  const media = /@media\s*\(\s*min-width:\s*1200px\s*\)\s*\{((?:[^{}]*\{[^{}]*\})*[^{}]*)\}/.exec(css);
  assert.ok(media, 'no @media (min-width: 1200px) block');
  const rule = /\.portal-shell\s+\.portal-overview\s*\{([^}]*)\}/.exec(media[1]);
  assert.ok(rule, '.portal-shell .portal-overview missing at min-width 1200px');
  return rule[1];
}

test('at min-width 1200px the overview height comes from 100vh', () => {
  assert.match(wideRule(), /height:\s*calc\([^)]*100vh[^)]*\)/);
});

test('at min-width 1200px the overview hides overflow', () => {
  assert.match(wideRule(), /overflow:\s*hidden/);
});

test('the overview rule is not applied outside the wide media block', () => {
  const outside = css.replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
  const rule = /\.portal-shell\s+\.portal-overview\s*\{([^}]*)\}/.exec(outside);
  assert.ok(!rule || !/100vh/.test(rule[1]), 'height from 100vh must not apply below 1200px');
});
