const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { makeShopDb } = require('../helpers/shopSqliteDb');

const sql = fs.readFileSync(
  path.join(__dirname, '../../src/db/migrations/015_star_status_history.sql'),
  'utf8'
);
const schema = fs.readFileSync(path.join(__dirname, '../../src/db/schema.sql'), 'utf8');
const statements = sql.replace(/^--.*$/gm, '').split(';').map((s) => s.trim()).filter(Boolean);

const historyTable = () => {
  const start = schema.indexOf('CREATE TABLE `star_status_history`');
  assert.notEqual(start, -1, 'schema.sql is missing star_status_history');
  return schema.slice(start, schema.indexOf(';', start));
};

test('migration 015 is one CREATE TABLE with run order header', () => {
  assert.equal(statements.length, 1);
  assert.match(statements[0], /^CREATE TABLE star_status_history\b/);
  assert.match(sql, /after 014_client_notes\.sql/);
  assert.match(sql, /back up the database first/);
  assert.match(sql, /dry run on a database copy/);
  assert.match(sql, /BEFORE deploying/);
});

test('table has every column and key, and no foreign keys or backfill', () => {
  const create = statements[0];
  [
    'id INT NOT NULL AUTO_INCREMENT',
    'job_part_id INT NOT NULL',
    'job_id INT NOT NULL',
    'company_id INT NOT NULL',
    'from_status VARCHAR(20) NULL',
    'to_status VARCHAR(20) NOT NULL',
    "source ENUM('admin','nfc') NOT NULL",
    'changed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP',
    'PRIMARY KEY (id)',
    'KEY idx_ssh_changed (changed_at)',
    'KEY idx_ssh_company (company_id)',
  ].forEach((part) => assert.ok(create.includes(part), part));
  assert.doesNotMatch(create, /FOREIGN KEY|REFERENCES/i);
  assert.doesNotMatch(sql, /INSERT|UPDATE/i);
});

test('schema.sql has the same table in dump style without foreign keys', () => {
  const t = historyTable();
  [
    '`id` int NOT NULL AUTO_INCREMENT',
    '`job_part_id` int NOT NULL',
    '`job_id` int NOT NULL',
    '`company_id` int NOT NULL',
    '`from_status` varchar(20) DEFAULT NULL',
    '`to_status` varchar(20) NOT NULL',
    "`source` enum('admin','nfc') NOT NULL",
    '`changed_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP',
    'PRIMARY KEY (`id`)',
    'KEY `idx_ssh_changed` (`changed_at`)',
    'KEY `idx_ssh_company` (`company_id`)',
  ].forEach((col) => assert.ok(t.includes(col), col));
  assert.doesNotMatch(t, /FOREIGN KEY/);
});

test('makeShopDb runs execute() like mysql2 and keeps history after an unstar', async () => {
  const db = makeShopDb();
  const [star] = await db.execute('INSERT INTO stars (job_part_id, attention) VALUES (?, ?)', [7, 'x']);
  const [hist] = await db.execute(
    'INSERT INTO star_status_history (job_part_id, job_id, company_id, from_status, to_status, source) VALUES (?, ?, ?, ?, ?, ?)',
    [7, 1, 2, null, 'open', 'admin']
  );
  assert.equal(hist.affectedRows, 1);
  await db.execute('DELETE FROM stars WHERE id = ?', [star.insertId]);
  const [rows] = await db.execute('SELECT to_status, from_status FROM star_status_history WHERE job_part_id = ?', [7]);
  assert.deepEqual(rows, [{ to_status: 'open', from_status: null }]);
  const [stars] = await db.execute('SELECT status FROM stars');
  assert.deepEqual(stars, []);
  for (const t of ['company', 'job', 'part', 'job_part', 'uploaded_files']) {
    const [r] = await db.execute(`SELECT * FROM ${t}`);
    assert.deepEqual(r, []);
  }
});
