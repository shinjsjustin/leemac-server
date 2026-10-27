const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const doc = fs.readFileSync(path.join(__dirname, '../../docs/deploy-trusted-browser.md'), 'utf8');

const phrases = [
  '011_trusted_device.sql',
  '010_login_security.sql',
  'dry-run',
  'idea-0014',
  '30 days',
  'explicit yes',
  'Trust this browser for 30 days',
  'Google sign-in',
  'account page',
  'details page',
  'Reset 2FA',
  'password reset',
  'password change',
];

for (const phrase of phrases) {
  test(`trusted browser deploy doc mentions ${phrase}`, () => {
    assert.ok(doc.includes(phrase));
  });
}

test('trusted browser deploy doc orders prerequisite, dry-run, production run, then deploy', () => {
  const order = [
    doc.indexOf('010_login_security.sql'),
    doc.indexOf('dry-run'),
    doc.indexOf('Run `src/db/migrations/011_trusted_device.sql` on production'),
    doc.indexOf('deploy branch idea-0014'),
  ];
  assert.ok(order.every((i) => i >= 0));
  assert.deepStrictEqual([...order].sort((a, b) => a - b), order);
});
