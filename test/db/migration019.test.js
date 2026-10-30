const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const sql = fs.readFileSync(
  path.join(__dirname, '../../src/db/migrations/019_job_documents.sql'),
  'utf8'
);
const schema = fs.readFileSync(path.join(__dirname, '../../src/db/schema.sql'), 'utf8');
const statements = sql.replace(/^--.*$/gm, '').split(';').map((s) => s.trim()).filter(Boolean);
const header = sql.split('\n').filter((l) => l.startsWith('--')).join('\n');

const table = (name) => {
  const start = schema.indexOf(`CREATE TABLE \`${name}\``);
  assert.notEqual(start, -1, `schema.sql is missing ${name}`);
  return schema.slice(start, schema.indexOf(';', start));
};
const create = statements.find((s) => s.startsWith('CREATE TABLE job_document ('));
const alter = statements.find((s) => /^ALTER TABLE job\s/.test(s));

test('migration 019 header gives run order, backup, dry run and the duplicate pre-check', () => {
  assert.match(header, /after 018_printing\.sql/);
  assert.match(header, /BEFORE deploying/);
  assert.match(header, /back up the database first/);
  assert.match(header, /dry run on a database copy/);
  assert.match(header, /-- SELECT TRIM\(invoice_number\)[^\n]*\n-- FROM job\b/);
  assert.match(header, /GROUP BY TRIM\(invoice_number\)/);
  assert.match(header, /HAVING COUNT\(\*\) > 1/);
  assert.match(header, /no rows/);
});

test('migration only creates job_document and alters job, dropping nothing', () => {
  assert.equal(statements.length, 2);
  assert.ok(create);
  assert.ok(alter);
  assert.doesNotMatch(statements.join(';').replace(/ON DELETE (CASCADE|SET NULL)/g, ''), /DROP|DELETE/i);
});

test('job_document has its columns, unique key and foreign keys', () => {
  for (const col of [
    'id INT NOT NULL AUTO_INCREMENT',
    'job_id INT NOT NULL',
    "type ENUM('quote','order','invoice','packing','shipping') NOT NULL",
    'fields JSON NOT NULL',
    'parts JSON NOT NULL',
    'file_id INT NULL',
    'saved_by_id VARCHAR(255)',
    'saved_by_name VARCHAR(255)',
    'created_at DATETIME',
    'saved_at DATETIME',
    'PRIMARY KEY (id)',
    'UNIQUE KEY uq_job_document (job_id, type)',
    'FOREIGN KEY (job_id) REFERENCES job (id) ON DELETE CASCADE',
    'FOREIGN KEY (file_id) REFERENCES uploaded_files (id) ON DELETE SET NULL',
  ]) {
    assert.ok(create.includes(col), `job_document is missing ${col}`);
  }
});

test('job gets a stored generated invoice_number_key that is unique', () => {
  assert.ok(
    alter.includes(
      "ADD COLUMN invoice_number_key VARCHAR(50) GENERATED ALWAYS AS (NULLIF(TRIM(invoice_number), '')) STORED"
    )
  );
  assert.ok(alter.includes('ADD UNIQUE KEY uq_job_invoice_number (invoice_number_key)'));
});

test('schema.sql shows job_document and the invoice key in dump style', () => {
  const doc = table('job_document');
  assert.ok(doc.includes("`type` enum('quote','order','invoice','packing','shipping') NOT NULL"));
  assert.ok(doc.includes('`fields` json NOT NULL'));
  assert.ok(doc.includes('`parts` json NOT NULL'));
  assert.ok(doc.includes('`file_id` int DEFAULT NULL'));
  assert.ok(doc.includes('UNIQUE KEY `uq_job_document` (`job_id`,`type`)'));
  assert.ok(doc.includes('FOREIGN KEY (`job_id`) REFERENCES `job` (`id`) ON DELETE CASCADE'));
  assert.ok(doc.includes('FOREIGN KEY (`file_id`) REFERENCES `uploaded_files` (`id`) ON DELETE SET NULL'));
  const job = table('job');
  assert.ok(
    job.includes(
      "`invoice_number_key` varchar(50) GENERATED ALWAYS AS (NULLIF(TRIM(`invoice_number`), '')) STORED"
    )
  );
  assert.ok(job.includes('UNIQUE KEY `uq_job_invoice_number` (`invoice_number_key`)'));
  assert.ok(schema.indexOf('CREATE TABLE `print_agent`') < schema.indexOf('CREATE TABLE `job_document`'));
});
