const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const read = (p) => fs.readFileSync(path.join(__dirname, '../../src/db', p), 'utf8');
const sources = {
  'migration 006': () => read('migrations/006_bourne_write_log.sql'),
  'schema.sql': () => read('schema.sql'),
};

const block = (sql) => {
  const m = sql.match(/CREATE TABLE (?:IF NOT EXISTS )?`?bourne_write_log`? \(([\s\S]*?)\n\)/);
  assert.ok(m, 'creates bourne_write_log');
  return m[1];
};
const col = (name, type) => new RegExp('`?' + name + '`?\\s+' + type + '(?=[\\s,]|$)', 'im');

const columns = [
  ['id', 'INT\\s+(NOT NULL\\s+)?AUTO_INCREMENT'],
  ['actor', 'VARCHAR\\(50\\)\\s+NULL'],
  ['method', 'VARCHAR\\(10\\)\\s+NOT NULL'],
  ['path', 'VARCHAR\\(255\\)\\s+NOT NULL'],
  ['status', 'SMALLINT\\s+NOT NULL'],
  ['accepted', 'TINYINT\\(1\\)\\s+NOT NULL'],
  ['ip', 'VARCHAR\\(64\\)\\s+NULL'],
  ['request_summary', 'JSON\\s+NULL'],
  ['created_at', 'TIMESTAMP\\s+(NULL\\s+)?DEFAULT CURRENT_TIMESTAMP'],
];

for (const [label, get] of Object.entries(sources)) {
  test(`${label} defines every bourne_write_log column`, () => {
    const b = block(get());
    for (const [name, type] of columns) assert.match(b, col(name, type), name);
  });
  test(`${label} has primary key on id and an index on created_at`, () => {
    const b = block(get());
    assert.match(b, /id\b[^\n]*PRIMARY KEY|PRIMARY KEY \(`?id`?\)/i);
    assert.match(b, /KEY\s+`?\w+`?\s*\(`?created_at`?\)/i);
  });
}

test('migration 006 is idempotent, has no data changes, and notes ordering', () => {
  const sql = read('migrations/006_bourne_write_log.sql');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS bourne_write_log/);
  assert.doesNotMatch(sql, /\b(INSERT|UPDATE|DELETE|DROP|ALTER)\b/i);
  assert.match(sql, /after 005/i);
});
