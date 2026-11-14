const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const sql = fs.readFileSync(
  path.join(__dirname, '../../src/db/migrations/026_q4_2026_period.sql'),
  'utf8'
);
const statements = sql.replace(/^--.*$/gm, '').split(';').map((s) => s.trim()).filter(Boolean);
const header = sql.split('\n').filter((l) => l.startsWith('--')).join('\n');

function seed() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE financial_period (id INTEGER PRIMARY KEY AUTOINCREMENT, lable TEXT NOT NULL,
      quarter INT NOT NULL, year INT NOT NULL, start_date TEXT NOT NULL, end_date TEXT NOT NULL,
      UNIQUE (quarter, year));
    CREATE TABLE job (id INTEGER PRIMARY KEY, invoice_date TEXT);
    CREATE TABLE job_period (job_id INT, financial_period_id INT);
    CREATE TABLE expense (id INTEGER PRIMARY KEY, expense_date TEXT);
    CREATE TABLE expense_financial_period (id INTEGER PRIMARY KEY AUTOINCREMENT,
      expense_id INT, financial_period_id INT, UNIQUE (expense_id, financial_period_id));
    CREATE TABLE metadata (metakey TEXT PRIMARY KEY, metavalue TEXT);
    INSERT INTO financial_period (id, lable, quarter, year, start_date, end_date) VALUES
      (1, 'Q2 2026', 2, 2026, '2026-04-01', '2026-06-30'),
      (2, 'Q3 2026', 3, 2026, '2026-07-01', '2026-12-31');
    INSERT INTO job (id, invoice_date) VALUES
      (1, '2026-08-15'), (2, '2026-09-30'), (3, '2026-10-01'), (4, '2026-12-31');
    INSERT INTO job_period (job_id, financial_period_id) VALUES (1, 2), (2, 2), (3, 2), (4, 2);
    INSERT INTO expense (id, expense_date) VALUES
      (10, '2026-09-30'), (11, '2026-10-05'), (12, '2026-11-20'), (13, '2026-12-31'), (14, '2026-06-01');
    INSERT INTO expense_financial_period (expense_id, financial_period_id) VALUES
      (10, 2), (11, 2), (13, 2), (14, 1);
    INSERT INTO metadata (metakey, metavalue) VALUES ('current_financial_period_id', '2');
  `);
  return db;
}

function migrate(db) {
  statements.forEach((s) => db.exec(s));
}

test('migration 026 header gives run order, backup and dry run', () => {
  assert.match(header, /after 025_invoice_paid_date\.sql/);
  assert.match(header, /BEFORE deploying/);
  assert.match(header, /back up the database first/);
  assert.match(header, /dry run on a database copy/);
});

test('Q3 2026 ends 2026-09-30 and Q4 2026 runs Oct 1 to Dec 31', () => {
  const db = seed();
  migrate(db);
  const q3 = db.prepare("SELECT end_date, start_date FROM financial_period WHERE lable = 'Q3 2026'").get();
  assert.equal(q3.start_date, '2026-07-01');
  assert.equal(q3.end_date, '2026-09-30');
  const q4 = db.prepare("SELECT * FROM financial_period WHERE lable = 'Q4 2026'").get();
  assert.equal(q4.quarter, 4);
  assert.equal(q4.year, 2026);
  assert.equal(q4.start_date, '2026-10-01');
  assert.equal(q4.end_date, '2026-12-31');
});

test('jobs invoiced Oct-Dec move to Q4 and earlier Q3 jobs stay', () => {
  const db = seed();
  migrate(db);
  const q4 = db.prepare("SELECT id FROM financial_period WHERE lable = 'Q4 2026'").get().id;
  const rows = db.prepare('SELECT job_id, financial_period_id AS p FROM job_period ORDER BY job_id').all();
  assert.deepEqual(rows.map((r) => [r.job_id, r.p]), [[1, 2], [2, 2], [3, q4], [4, q4]]);
});

test('Oct-Dec expenses link to Q4 once and lose Q3 link, including unlinked ones', () => {
  const db = seed();
  migrate(db);
  const q4 = db.prepare("SELECT id FROM financial_period WHERE lable = 'Q4 2026'").get().id;
  const rows = db
    .prepare('SELECT expense_id, financial_period_id AS p FROM expense_financial_period ORDER BY expense_id, p')
    .all();
  assert.deepEqual(
    rows.map((r) => [r.expense_id, r.p]),
    [[10, 2], [11, q4], [12, q4], [13, q4], [14, 1]]
  );
});

test('metadata current period holds the Q4 id', () => {
  const db = seed();
  migrate(db);
  const q4 = db.prepare("SELECT id FROM financial_period WHERE lable = 'Q4 2026'").get().id;
  const row = db.prepare("SELECT metavalue FROM metadata WHERE metakey = 'current_financial_period_id'").get();
  assert.equal(String(row.metavalue), String(q4));
});
