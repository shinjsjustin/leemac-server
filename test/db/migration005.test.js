const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const migration = fs.readFileSync(
  path.join(__dirname, '../../src/db/migrations/005_prices_part_fields_job_files.sql'), 'utf8');
const schema = fs.readFileSync(path.join(__dirname, '../../src/db/schema.sql'), 'utf8');

const tableBlock = (sql, table) => {
  const m = sql.match(new RegExp('CREATE TABLE `?' + table + '`? \\(([\\s\\S]*?)\\n\\)'));
  assert.ok(m, `schema.sql has CREATE TABLE ${table}`);
  return m[1];
};
const col = (name, type, tail = '') =>
  new RegExp('`?' + name + '`?\\s+' + type + tail, 'i');
const alter = (table) => new RegExp('ALTER TABLE `?' + table + '`?[^;]*', 'ig');
const alterText = (table) => (migration.match(alter(table)) || []).join('\n');

const NULLABLE = '(?![^,\\n]*NOT NULL)';
const DEC = 'DECIMAL\\(10,\\s*2\\)';

// [table, column, type regex]
const columns = [
  ['job_part', 'price', DEC],
  ['job', 'subtotal', DEC],
  ['job', 'total_cost', DEC],
  ['job_part', 'material', 'VARCHAR\\(100\\)' + NULLABLE],
  ['job_part', 'finish', 'VARCHAR\\(100\\)' + NULLABLE],
  ['job_part', 'stock_size', 'VARCHAR\\(100\\)' + NULLABLE],
  ['job_part', 'details', 'VARCHAR\\(255\\)'],
  ['uploaded_files', 'job_id', 'INT' + NULLABLE],
  ['uploaded_files', 'mimetype', 'VARCHAR\\(100\\)'],
];

for (const [table, name, type] of columns) {
  test(`migration 005 sets ${table}.${name}`, () => {
    assert.match(alterText(table), col(name, type));
  });
  test(`schema.sql shows ${table}.${name} as after migration`, () => {
    assert.match(tableBlock(schema, table), col(name, type));
  });
}

test('migration 005 indexes and constrains uploaded_files.job_id', () => {
  const sql = alterText('uploaded_files');
  assert.match(sql, /ADD\s+KEY\s+`?\w+`?\s*\(`?job_id`?\)/i);
  assert.match(sql, /FOREIGN KEY\s*\(`?job_id`?\)\s*REFERENCES\s+`?job`?\s*\(`?id`?\)/i);
});

test('schema.sql indexes and constrains uploaded_files.job_id', () => {
  const sql = tableBlock(schema, 'uploaded_files');
  assert.match(sql, /\bKEY\s+`?\w+`?\s*\(`?job_id`?\)/i);
  assert.match(sql, /FOREIGN KEY\s*\(`?job_id`?\)\s*REFERENCES\s+`?job`?\s*\(`?id`?\)/i);
});

test('migration 005 changes no data', () => {
  assert.doesNotMatch(migration.replace(/--.*$/gm, ''), /\b(UPDATE|INSERT|DELETE|DROP)\b/i);
});
