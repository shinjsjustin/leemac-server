const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('About page shows the leemac.co contact email only', () => {
  const about = read('src/client/src/components/About.js');
  assert.ok(about.includes('leemac@leemac.co'));
  assert.ok(!about.includes('leemacmfg.com'));
});

test('scratch verify script is deleted', () => {
  assert.ok(!fs.existsSync(path.join(root, 'src/lib/ai/agents/__scratch_verifyLoop.js')));
});

test('the Jarvis AI library is gone', () => {
  assert.ok(!fs.existsSync(path.join(root, 'src/lib/ai')));
});
