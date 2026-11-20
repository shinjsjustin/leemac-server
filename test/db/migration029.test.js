const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { createMigrationDb } = require('../helpers/migrationSqlite');

const migration = fs.readFileSync(
  path.join(__dirname, '../../src/db/migrations/029_notes_process_steps.sql'),
  'utf8'
);
const schema = fs.readFileSync(path.join(__dirname, '../../src/db/schema.sql'), 'utf8');

const PRE_029 = `
CREATE TABLE expense (id INT NOT NULL AUTO_INCREMENT, PRIMARY KEY (id)) ENGINE=InnoDB;
CREATE TABLE job (id INT NOT NULL AUTO_INCREMENT, PRIMARY KEY (id)) ENGINE=InnoDB;
CREATE TABLE part (id INT NOT NULL AUTO_INCREMENT, number VARCHAR(100) DEFAULT NULL, description VARCHAR(255) DEFAULT NULL, company INT DEFAULT NULL, PRIMARY KEY (id)) ENGINE=InnoDB;
CREATE TABLE expense_job (id INT NOT NULL AUTO_INCREMENT, expense_id INT NOT NULL, job_id INT NOT NULL, notes VARCHAR(255) DEFAULT NULL, PRIMARY KEY (id)) ENGINE=InnoDB;
`;

// The helper has no TEXT type, so notes is a varchar here. It does not model DROP COLUMN, but sqlite runs this ALTER natively.
const migrated = () => {
  const { db, run } = createMigrationDb();
  run(PRE_029);
  db.exec(`INSERT INTO expense DEFAULT VALUES;
    INSERT INTO job DEFAULT VALUES;
    INSERT INTO part (number, description, company) VALUES ('P1', 'bracket', 3);
    INSERT INTO expense_job (expense_id, job_id, notes) VALUES (1, 1, 'old note')`);
  db.exec(migration);
  return db;
};

const columns = (db, table) => db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);

const schemaColumns = (table) => {
  const start = schema.indexOf(`CREATE TABLE \`${table}\``);
  assert.notEqual(start, -1, `schema.sql is missing ${table}`);
  return [...schema.slice(start, schema.indexOf(';', start)).matchAll(/^\s+`(\w+)` /gm)].map((m) => m[1]);
};

test('029 adds a nullable process_steps to part and keeps existing parts', () => {
  const db = migrated();
  const row = db.prepare('SELECT number, description, company, process_steps FROM part').get();
  assert.deepEqual({ ...row }, { number: 'P1', description: 'bracket', company: 3, process_steps: null });
  db.exec(`UPDATE part SET process_steps = 'Deburr, anodize'`);
  assert.equal(db.prepare('SELECT process_steps FROM part').get().process_steps, 'Deburr, anodize');
});

test('029 drops expense_job.notes and keeps existing rows', () => {
  const db = migrated();
  assert.deepEqual(columns(db, 'expense_job'), ['id', 'expense_id', 'job_id']);
  assert.deepEqual({ ...db.prepare('SELECT id, expense_id, job_id FROM expense_job').get() }, { id: 1, expense_id: 1, job_id: 1 });
});

test('schema.sql has process_steps on part and no notes on expense_job', () => {
  assert.ok(schemaColumns('part').includes('process_steps'));
  assert.deepEqual(schemaColumns('expense_job'), ['id', 'expense_id', 'job_id']);
});
