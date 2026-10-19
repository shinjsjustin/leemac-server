const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const sql = fs.readFileSync(
  path.join(__dirname, '../../src/db/migrations/008_email_link.sql'),
  'utf8'
);
const schema = fs.readFileSync(path.join(__dirname, '../../src/db/schema.sql'), 'utf8');
const statements = sql.replace(/^--.*$/gm, '').split(';').map((s) => s.trim()).filter(Boolean);
const table = statements[0];

test('migration 008 is a single CREATE TABLE IF NOT EXISTS statement', () => {
  assert.equal(statements.length, 1);
  assert.match(table, /^CREATE TABLE IF NOT EXISTS email_link \(/);
});

test('job_id and part_id are nullable with cascading foreign keys', () => {
  assert.match(table, /job_id\s+INT NULL/);
  assert.match(table, /part_id\s+INT NULL/);
  assert.match(table, /FOREIGN KEY \(job_id\) REFERENCES job\(id\) ON DELETE CASCADE/);
  assert.match(table, /FOREIGN KEY \(part_id\) REFERENCES part\(id\) ON DELETE CASCADE/);
});

test('has no CHECK constraint', () => {
  assert.doesNotMatch(table, /\bCHECK\b/i);
});

test('declares the pointer columns', () => {
  assert.match(table, /message_id\s+VARCHAR\(255\) NOT NULL/);
  assert.match(table, /subject\s+VARCHAR\(255\) NULL/);
  assert.match(table, /from_address\s+VARCHAR\(255\) NULL/);
  assert.match(table, /sent_at\s+DATETIME NOT NULL/);
  assert.match(table, /created_by\s+VARCHAR\(50\) NOT NULL/);
  assert.match(table, /created_at\s+TIMESTAMP DEFAULT CURRENT_TIMESTAMP/);
});

test('message ids are unique per job and per part', () => {
  assert.match(table, /UNIQUE KEY uq_email_link_job \(job_id, message_id\)/);
  assert.match(table, /UNIQUE KEY uq_email_link_part \(part_id, message_id\)/);
});

test('header says to run after 007', () => {
  assert.match(sql, /after 007_bourne_note_author\.sql/);
});

test('schema.sql has a matching email_link table', () => {
  assert.match(schema, /CREATE TABLE `email_link` \(/);
  assert.match(schema, /UNIQUE KEY `uq_email_link_job` \(`job_id`, `message_id`\)/);
  assert.match(schema, /UNIQUE KEY `uq_email_link_part` \(`part_id`, `message_id`\)/);
  assert.match(schema, /REFERENCES `job` \(`id`\) ON DELETE CASCADE/);
  assert.match(schema, /REFERENCES `part` \(`id`\) ON DELETE CASCADE/);
});
