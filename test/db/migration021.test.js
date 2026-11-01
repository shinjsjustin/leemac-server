const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const sql = fs.readFileSync(
  path.join(__dirname, '../../src/db/migrations/021_expense_file.sql'),
  'utf8'
);
const schema = fs.readFileSync(path.join(__dirname, '../../src/db/schema.sql'), 'utf8');
const statements = sql.replace(/^--.*$/gm, '').split(';').map((s) => s.trim()).filter(Boolean);
const header = sql.split('\n').filter((l) => l.startsWith('--')).join('\n');
const alter = statements.find((s) => /^ALTER TABLE expense\s/.test(s));

test('migration 021 header gives run order, backup and dry run', () => {
  assert.match(header, /after 020_document_leadtime_ship\.sql/);
  assert.match(header, /BEFORE deploying/);
  assert.match(header, /back up the database first/);
  assert.match(header, /dry run on a database copy/);
});

test('migration is one ALTER TABLE expense, dropping and deleting nothing', () => {
  assert.equal(statements.length, 1);
  assert.ok(alter);
  assert.doesNotMatch(statements.join(';'), /DROP|DELETE\s+FROM/i);
});

test('expense gains nullable file_id with fk_expense_file set null on delete', () => {
  const flat = alter.replace(/\s+/g, ' ');
  assert.ok(flat.includes('ADD COLUMN file_id INT NULL'));
  assert.ok(
    flat.includes(
      'ADD CONSTRAINT fk_expense_file FOREIGN KEY (file_id) REFERENCES uploaded_files (id) ON DELETE SET NULL'
    )
  );
});

test('schema.sql expense lists file_id and the foreign key, after uploaded_files is created', () => {
  const start = schema.indexOf('CREATE TABLE `expense`');
  assert.notEqual(start, -1);
  const expense = schema.slice(start, schema.indexOf(';', start));
  assert.ok(expense.includes('`file_id` int DEFAULT NULL'));
  assert.match(
    expense,
    /CONSTRAINT `fk_expense_file` FOREIGN KEY \(`file_id`\) REFERENCES `uploaded_files` \(`id`\) ON DELETE SET NULL/
  );
  const files = schema.indexOf('CREATE TABLE `uploaded_files`');
  assert.notEqual(files, -1);
  assert.ok(files < start);
});
