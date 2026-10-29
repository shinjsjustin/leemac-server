const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

test('scratch verify script is deleted', () => {
  assert.ok(!fs.existsSync(path.join(root, 'src/lib/ai/agents/__scratch_verifyLoop.js')));
});

test('the Jarvis AI library is gone', () => {
  assert.ok(!fs.existsSync(path.join(root, 'src/lib/ai')));
});
