const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const sql = fs.readFileSync(
  path.join(__dirname, '../../src/db/migrations/020_document_leadtime_ship.sql'),
  'utf8'
);
const schema = fs.readFileSync(path.join(__dirname, '../../src/db/schema.sql'), 'utf8');
const statements = sql.replace(/^--.*$/gm, '').split(';').map((s) => s.trim()).filter(Boolean);
const header = sql.split('\n').filter((l) => l.startsWith('--')).join('\n');

const alter = statements.find((s) => /^ALTER TABLE job\s/.test(s));
const update = statements.find((s) => /^UPDATE job\s/.test(s));

test('migration 020 header gives run order, backup and dry run', () => {
  assert.match(header, /after 019_job_documents\.sql/);
  assert.match(header, /BEFORE deploying/);
  assert.match(header, /back up the database first/);
  assert.match(header, /dry run on a database copy/);
});

test('migration is one ALTER and one UPDATE, dropping and deleting nothing', () => {
  assert.equal(statements.length, 2);
  assert.ok(alter);
  assert.ok(update);
  assert.doesNotMatch(statements.join(';'), /DROP|DELETE/i);
});

test('job gains nullable leadtime and invoice_clicked_at', () => {
  assert.ok(alter.includes('ADD COLUMN leadtime VARCHAR(64) NULL'));
  assert.ok(alter.includes('ADD COLUMN invoice_clicked_at DATETIME NULL'));
});

test('backfill copies invoice_date only where unset and invoiced, leaving leadtime alone', () => {
  assert.equal(
    update.replace(/\s+/g, ' '),
    'UPDATE job SET invoice_clicked_at = invoice_date WHERE invoice_clicked_at IS NULL AND invoice_date IS NOT NULL'
  );
});

test('schema.sql lists both columns on job next to invoice_date', () => {
  const start = schema.indexOf('CREATE TABLE `job`');
  assert.notEqual(start, -1);
  const job = schema.slice(start, schema.indexOf(';', start));
  assert.ok(job.includes('`leadtime` varchar(64) DEFAULT NULL'));
  assert.ok(job.includes('`invoice_clicked_at` datetime DEFAULT NULL'));
  assert.ok(job.indexOf('`invoice_date`') < job.indexOf('`invoice_clicked_at`'));
});
