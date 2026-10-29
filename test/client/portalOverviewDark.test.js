const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const styling = path.join(__dirname, '../../src/client/src/components/Styling');
const read = (name) => fs.readFileSync(path.join(styling, name), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const portalCss = read('ClientPortal.css');
const overviewCss = read('PortalOverview.css');

const escape = (selector) => selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const ruleBody = (css, selector) => {
  const rule = new RegExp(`(?:^|\\})\\s*${escape(selector)}\\s*\\{([^}]*)\\}`).exec(css);
  assert.ok(rule, `${selector} rule missing`);
  return rule[1];
};

test('the dark shell recolours the page with dark tokens', () => {
  assert.match(ruleBody(portalCss, '.portal-shell.portal-shell--dark'), /background:\s*var\(--portal-dark-bg\)/);
});

test('the dark shell recolours the top bar with dark tokens', () => {
  const body = ruleBody(portalCss, '.portal-shell--dark .portal-topbar');
  assert.match(body, /background:\s*var\(--portal-dark-surface\)/);
  assert.match(body, /border-bottom:[^;]*var\(--portal-dark-line\)/);
});

test('the dark shell recolours nav links with dark tokens', () => {
  assert.match(ruleBody(portalCss, '.portal-shell--dark .portal-nav-link'), /color:\s*var\(--portal-dark-text\)/);
});

test('the dark shell recolours the wordmark with a dark token', () => {
  assert.match(ruleBody(portalCss, '.portal-shell--dark .portal-wordmark'), /color:\s*var\(--portal-dark-text\)/);
});

test('stats are bordered dark cards with small caps labels', () => {
  const stat = ruleBody(overviewCss, '.portal-shell .portal-overview-stat');
  assert.match(stat, /border:[^;]*var\(--portal-dark-line\)/);
  assert.match(stat, /background:\s*var\(--portal-dark-surface\)/);
  assert.match(ruleBody(overviewCss, '.portal-shell .portal-overview-stat span'), /text-transform:\s*uppercase/);
});

test('at min-width 1200px the overview has three columns ending in the rail width and a full-width bottom row', () => {
  const media = /@media\s*\(\s*min-width:\s*1200px\s*\)\s*\{((?:[^{}]*\{[^{}]*\})*[^{}]*)\}/.exec(overviewCss);
  assert.ok(media, 'no 1200px block');
  const rule = /\.portal-shell\s+\.portal-overview\s*\{([^}]*)\}/.exec(media[1]);
  assert.ok(rule);
  assert.match(rule[1], /grid-template-columns:\s*400px\s+1fr\s+var\(--portal-rail-w\)/);
  assert.match(media[1], /\.portal-overview-bottom\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/);
});

test('the NOW label stays on one line', () => {
  assert.match(ruleBody(overviewCss, '.portal-shell .portal-sched-now b'), /white-space:\s*nowrap/);
});
