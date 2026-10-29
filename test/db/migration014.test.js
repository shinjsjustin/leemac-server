const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const sql = fs.readFileSync(
  path.join(__dirname, '../../src/db/migrations/014_client_notes.sql'),
  'utf8'
);
const schema = fs.readFileSync(path.join(__dirname, '../../src/db/schema.sql'), 'utf8');
const statements = sql.replace(/^--.*$/gm, '').split(';').map((s) => s.trim()).filter(Boolean);
const [alter, ...updates] = statements;

const PORTAL_EMAIL = 'client-portal@leemac.invalid';

const noteTable = () => {
  const start = schema.indexOf('CREATE TABLE `note`');
  assert.notEqual(start, -1, 'schema.sql is missing note');
  return schema.slice(start, schema.indexOf('\n);', start));
};

test('migration 014 is one ALTER then three UPDATEs, with run order header', () => {
  assert.equal(statements.length, 4);
  assert.match(alter, /^ALTER TABLE note\b/);
  updates.forEach((u) => assert.match(u, /^UPDATE note SET\b/));
  assert.match(sql, /after 013_part_lists\.sql/);
  assert.match(sql, /back up the database first/);
  assert.match(sql, /dry run on a database copy/);
  assert.match(sql, /BEFORE deploying/);
});

test('ALTER makes jobid nullable and adds every column, key and the part foreign key', () => {
  [
    'MODIFY jobid INT NULL',
    'ADD part_id INT NULL',
    'ADD company_id INT NULL',
    'ADD client_id INT NULL',
    'ADD client_name VARCHAR(100) NULL',
    'ADD shared TINYINT(1) NOT NULL DEFAULT 0',
    'ADD updated_at DATETIME NULL',
  ].forEach((part) => assert.ok(alter.includes(part), part));
  assert.match(alter, /ADD KEY idx_note_part \(part_id\)/);
  assert.match(alter, /ADD KEY idx_note_company \(company_id\)/);
  assert.match(alter, /ADD KEY idx_note_client \(client_id\)/);
  assert.match(alter, /FOREIGN KEY \(part_id\) REFERENCES part \(id\) ON DELETE CASCADE/);
  assert.doesNotMatch(alter, /FOREIGN KEY \(client_id\)/);
  assert.doesNotMatch(alter, /DROP|status/i);
});

test('every backfill targets only notes by the client portal admin', () => {
  updates.forEach((u) => {
    assert.ok(u.includes(PORTAL_EMAIL), u);
    assert.match(u, /userid IN \(SELECT id FROM admin WHERE email = 'client-portal@leemac\.invalid'\)/);
  });
});

test('backfill sets company from the job, name from the prefix, strips it, then matches client', () => {
  const [company, strip, client] = [updates[0], updates[1], updates[2]];
  assert.match(company, /company_id = \(SELECT company_id FROM job WHERE id = note\.jobid\)/);
  assert.match(company, /client_name = CASE WHEN LOCATE\(': ', content\) > 1/);
  assert.match(company, /ELSE 'Client' END/);
  assert.match(strip, /content = SUBSTRING\(content, LOCATE\(': ', content\) \+ 2\)/);
  assert.match(client, /SELECT COUNT\(\*\) FROM clients/);
  assert.match(client, /= 1/);
  assert.equal(updates.length, 3);
});

test('schema.sql note table lists every new column, key and foreign key in dump style', () => {
  const t = noteTable();
  [
    '`jobid` int DEFAULT NULL',
    '`part_id` int DEFAULT NULL',
    '`company_id` int DEFAULT NULL',
    '`client_id` int DEFAULT NULL',
    '`client_name` varchar(100) DEFAULT NULL',
    "`shared` tinyint(1) NOT NULL DEFAULT '0'",
    '`updated_at` datetime DEFAULT NULL',
    "`status` enum('new','acknowledged','done') NOT NULL DEFAULT 'new'",
  ].forEach((col) => assert.ok(t.includes(col), col));
  assert.match(t, /KEY `idx_note_part` \(`part_id`\)/);
  assert.match(t, /KEY `idx_note_company` \(`company_id`\)/);
  assert.match(t, /KEY `idx_note_client` \(`client_id`\)/);
  assert.match(t, /FOREIGN KEY \(`part_id`\) REFERENCES `part` \(`id`\) ON DELETE CASCADE/);
});
