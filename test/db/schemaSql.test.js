const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const sql = fs.readFileSync(path.join(__dirname, '../../src/db/schema.sql'), 'utf8');
const chunks = sql.split('CREATE TABLE').slice(1).map((chunk) => ({
  name: /^\s*`?(\w+)`?/.exec(chunk)[1],
  body: chunk.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n').trim(),
}));

test('every CREATE TABLE statement ends with a semicolon', () => {
  for (const { name, body } of chunks) {
    assert.ok(body.endsWith(';'), `${name} is not terminated with ;`);
  }
});

for (const table of ['auth_session', 'auth_token', 'auth_backup_code']) {
  test(`${table} is closed with a parenthesis, optional table options, then a semicolon`, () => {
    const chunk = chunks.find((c) => c.name === table);
    assert.ok(chunk, `${table} not found`);
    assert.match(chunk.body, /\)[^;()]*;$/);
  });
}
