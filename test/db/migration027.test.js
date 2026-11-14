const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const read = (rel) => fs.readFileSync(path.join(__dirname, '../..', rel), 'utf8');
const UNDO_PATH = 'src/db/rollback/027_flip_waiting_invoices_undo.sql';
const migration = read('src/db/migrations/027_flip_waiting_invoices.sql');
const undo = read(UNDO_PATH);
const header = migration.split('\n').filter((l) => l.startsWith('--')).join('\n');

const run = (db, sql) => {
  sql.replace(/^--.*$/gm, '').split(';').map((s) => s.trim()).filter(Boolean)
    .forEach((s) => db.exec(s));
};

const seed = () => {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE job (id INTEGER PRIMARY KEY, invoice_number TEXT,
    invoice_status TEXT, paid_date TEXT)`);
  db.exec(`CREATE TABLE invoice_paid_flip (id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id INTEGER NOT NULL, flipped_at TEXT NOT NULL)`);
  db.exec(`INSERT INTO job VALUES
    (1, 'INV-1', 'waiting', NULL),
    (2, 'INV-2', 'waiting', NULL),
    (3, NULL, 'waiting', NULL),
    (4, '  ', 'waiting', NULL),
    (5, 'INV-5', 'paid', '2026-01-02'),
    (6, '', 'waiting', NULL)`);
  return db;
};
const rows = (db, q) => db.prepare(q).all().map((r) => ({ ...r }));

test('migration 027 header gives run order, backup, dry run and undo path', () => {
  assert.match(header, /after 026_q4_2026_period\.sql/);
  assert.match(header, /BEFORE deploying/);
  assert.match(header, /back up the database first/);
  assert.match(header, /dry run on a database copy/);
  assert.ok(header.includes(UNDO_PATH));
});

test('flips only invoiced waiting jobs to paid with NULL paid_date', () => {
  const db = seed();
  run(db, migration);
  assert.deepEqual(rows(db, 'SELECT id, invoice_status, paid_date FROM job ORDER BY id'), [
    { id: 1, invoice_status: 'paid', paid_date: null },
    { id: 2, invoice_status: 'paid', paid_date: null },
    { id: 3, invoice_status: 'waiting', paid_date: null },
    { id: 4, invoice_status: 'waiting', paid_date: null },
    { id: 5, invoice_status: 'paid', paid_date: '2026-01-02' },
    { id: 6, invoice_status: 'waiting', paid_date: null },
  ]);
});

test('saves each flipped job id once with flipped_at', () => {
  const db = seed();
  run(db, migration);
  const flips = rows(db, 'SELECT job_id, flipped_at FROM invoice_paid_flip ORDER BY job_id');
  assert.deepEqual(flips.map((f) => f.job_id), [1, 2]);
  assert.ok(flips.every((f) => f.flipped_at));
});

test('undo restores flipped jobs to waiting but leaves a hand-paid job alone', () => {
  const db = seed();
  run(db, migration);
  db.exec(`UPDATE job SET paid_date = '2026-03-04' WHERE id = 2`);
  run(db, undo);
  assert.deepEqual(rows(db, 'SELECT id, invoice_status, paid_date FROM job ORDER BY id'), [
    { id: 1, invoice_status: 'waiting', paid_date: null },
    { id: 2, invoice_status: 'paid', paid_date: '2026-03-04' },
    { id: 3, invoice_status: 'waiting', paid_date: null },
    { id: 4, invoice_status: 'waiting', paid_date: null },
    { id: 5, invoice_status: 'paid', paid_date: '2026-01-02' },
    { id: 6, invoice_status: 'waiting', paid_date: null },
  ]);
});
