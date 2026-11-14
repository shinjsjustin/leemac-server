const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { createMigrationDb } = require('../helpers/migrationSqlite');

const sql = fs.readFileSync(
  path.join(__dirname, '../../src/db/migrations/025_invoice_paid_date.sql'),
  'utf8'
);
const schema = fs.readFileSync(path.join(__dirname, '../../src/db/schema.sql'), 'utf8');
const statements = sql.replace(/^--.*$/gm, '').split(';').map((s) => s.trim()).filter(Boolean);
const header = sql.split('\n').filter((l) => l.startsWith('--')).join('\n');
const flat = (s) => s.replace(/\s+/g, ' ');
const alter = statements.find((s) => /^ALTER TABLE job\s/.test(s));
const create = statements.find((s) => /^CREATE TABLE invoice_paid_flip\s/.test(s));

const NOW = '2026-01-01 00:00:00';

test('migration 025 header gives run order, backup and dry run', () => {
  assert.match(header, /after 024_qc_markings\.sql/);
  assert.match(header, /BEFORE deploying/);
  assert.match(header, /back up the database first/);
  assert.match(header, /dry run on a database copy/);
});

test('migration is one ALTER and one CREATE, dropping and deleting nothing', () => {
  assert.equal(statements.length, 2);
  assert.ok(alter);
  assert.ok(create);
  assert.doesNotMatch(statements.join(';'), /DROP|DELETE\s+FROM/i);
});

test('job gains a nullable DATE paid_date', () => {
  assert.ok(flat(alter).includes('ADD COLUMN paid_date DATE NULL'));
});

test('invoice_paid_flip accepts rows, with no foreign key on job_id', () => {
  const mdb = createMigrationDb();
  mdb.run(create + ';');
  const { db } = mdb;
  db.prepare('INSERT INTO invoice_paid_flip (job_id, flipped_at) VALUES (?, ?)').run(999, NOW);
  db.prepare('INSERT INTO invoice_paid_flip (job_id, flipped_at) VALUES (?, ?)').run(999, NOW);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM invoice_paid_flip').get().n, 2);
  assert.throws(() => db.prepare('INSERT INTO invoice_paid_flip (job_id, flipped_at) VALUES (NULL, ?)').run(NOW), /NOT NULL/);
  assert.throws(() => db.prepare('INSERT INTO invoice_paid_flip (job_id, flipped_at) VALUES (1, NULL)').run(), /NOT NULL/);
});

test('invoice_paid_flip is keyed on job_id', () => {
  assert.ok(flat(create).includes('KEY idx_invoice_paid_flip_job (job_id)'));
});

test('schema.sql job lists nullable paid_date right after invoice_status', () => {
  const start = schema.indexOf('CREATE TABLE `job`');
  assert.notEqual(start, -1);
  const job = schema.slice(start, schema.indexOf(';\n', start));
  const status = job.indexOf('`invoice_status`');
  const paid = job.indexOf('`paid_date` date DEFAULT NULL');
  assert.ok(status !== -1 && paid > status);
  assert.equal(job.slice(status, paid).split('\n').length, 2);
});

test('schema.sql invoice_paid_flip accepts the same rows', () => {
  const start = schema.indexOf('CREATE TABLE `invoice_paid_flip`');
  assert.notEqual(start, -1);
  const mdb = createMigrationDb();
  mdb.run(`${schema.slice(start, schema.indexOf(';', start))};`);
  mdb.db.prepare('INSERT INTO invoice_paid_flip (job_id, flipped_at) VALUES (?, ?)').run(999, NOW);
  assert.equal(mdb.db.prepare('SELECT COUNT(*) n FROM invoice_paid_flip').get().n, 1);
});
