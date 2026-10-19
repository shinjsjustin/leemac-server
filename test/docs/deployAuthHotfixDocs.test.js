const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const doc = fs.readFileSync(path.join(__dirname, '../../docs/deploy-auth-hotfix.md'), 'utf8');

for (const phrase of ['009_auth_hotfix.sql', 'log in again', 'Foster', 'Santiago']) {
  test(`deploy doc mentions ${phrase}`, () => {
    assert.ok(doc.includes(phrase));
  });
}

test('deploy doc runs the migration before deploying the server', () => {
  assert.ok(doc.indexOf('009_auth_hotfix.sql') < doc.indexOf('deploy and restart the server'));
});
