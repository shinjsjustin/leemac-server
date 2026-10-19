const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const sql = fs.readFileSync(
  path.join(__dirname, '../../src/db/migrations/007_bourne_note_author.sql'),
  'utf8'
);
const statements = sql.replace(/^--.*$/gm, '').split(';').map((s) => s.trim()).filter(Boolean);

test('migration 007 is a single statement', () => {
  assert.equal(statements.length, 1);
});

test('inserts the Bourne admin with NULL password and invalid email', () => {
  assert.match(
    statements[0],
    /INSERT INTO admin \(name, title, access_level, email, password\)\s+SELECT 'Bourne', 'Assistant', 0, 'bourne@bourne\.invalid', NULL/
  );
});

test('only inserts when the email is absent', () => {
  assert.match(
    statements[0],
    /WHERE NOT EXISTS \(\s*SELECT 1 FROM admin WHERE email = 'bourne@bourne\.invalid'\s*\)/
  );
});

test('header says to run after 006', () => {
  assert.match(sql, /after 006_bourne_write_log\.sql/);
});
