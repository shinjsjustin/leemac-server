const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const sql = fs.readFileSync(
  path.join(__dirname, '../../src/db/migrations/022_job_no_bid.sql'),
  'utf8'
);
const schema = fs.readFileSync(path.join(__dirname, '../../src/db/schema.sql'), 'utf8');
const statements = sql.replace(/^--.*$/gm, '').split(';').map((s) => s.trim()).filter(Boolean);
const header = sql.split('\n').filter((l) => l.startsWith('--')).join('\n');
const alter = statements.find((s) => /^ALTER TABLE job\s/.test(s));

test('migration 022 header gives run order, backup and dry run', () => {
  assert.match(header, /after 021_expense_file\.sql/);
  assert.match(header, /BEFORE deploying/);
  assert.match(header, /back up the database first/);
  assert.match(header, /dry run on a database copy/);
});

test('migration is one ALTER TABLE job, dropping and deleting nothing', () => {
  assert.equal(statements.length, 1);
  assert.ok(alter);
  assert.doesNotMatch(statements.join(';'), /DROP|DELETE\s+FROM/i);
});

test('job gains nullable no_bid_at DATETIME and no_bid_by INT', () => {
  const flat = alter.replace(/\s+/g, ' ');
  assert.ok(flat.includes('ADD COLUMN no_bid_at DATETIME NULL'));
  assert.ok(flat.includes('ADD COLUMN no_bid_by INT NULL'));
});

test('schema.sql job lists no_bid_at and no_bid_by as nullable, after ship_date', () => {
  const start = schema.indexOf('CREATE TABLE `job`');
  assert.notEqual(start, -1);
  const job = schema.slice(start, schema.indexOf(';\n', start));
  const ship = job.indexOf('`ship_date`');
  const at = job.indexOf('`no_bid_at` datetime DEFAULT NULL');
  const by = job.indexOf('`no_bid_by` int DEFAULT NULL');
  assert.ok(ship !== -1 && at > ship && by > at);
});
