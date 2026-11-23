const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { createMigrationDb } = require('../helpers/migrationSqlite');

const migration = fs.readFileSync(
  path.join(__dirname, '../../src/db/migrations/030_company_bill_to.sql'),
  'utf8'
);
const schema = fs.readFileSync(path.join(__dirname, '../../src/db/schema.sql'), 'utf8');

const PRE_030 = `
CREATE TABLE company (id INT NOT NULL AUTO_INCREMENT, name VARCHAR(255) DEFAULT NULL, PRIMARY KEY (id)) ENGINE=InnoDB;
`;
const BILL_TO = ['bill_to_name', 'bill_to_line1', 'bill_to_line2', 'bill_to_line3', 'bill_to_line4', 'bill_to_line5'];
const WD = {
  bill_to_name: 'Western Digital Technologies, Inc.',
  bill_to_line1: 'c/o Accounts Payable - Shared Service Center',
  bill_to_line2: '109 Technology Avenue, Laguna Technopark',
  bill_to_line3: 'Binan, Laguna 4024',
  bill_to_line4: 'Philippines',
  bill_to_line5: 'AP.US@wdc.com',
};
const UNSET = Object.fromEntries(BILL_TO.map((c) => [c, null]));

const migrated = (names) => {
  const { db, run } = createMigrationDb();
  run(PRE_030);
  const insert = db.prepare('INSERT INTO company (name) VALUES (?)');
  names.forEach((n) => insert.run(n));
  db.exec(migration);
  return db;
};

const billTo = (db) =>
  db.prepare(`SELECT name, ${BILL_TO.join(', ')} FROM company ORDER BY id`).all().map((r) => ({ ...r }));

test('030 sets the WD bill-to when exactly one company is named WD Media, Inc', () => {
  const rows = billTo(migrated(['WD Media, Inc', 'Acme']));
  assert.deepEqual(rows, [
    { name: 'WD Media, Inc', ...WD },
    { name: 'Acme', ...UNSET },
  ]);
});

test('030 leaves every bill-to unset when no company is named WD Media, Inc', () => {
  assert.deepEqual(billTo(migrated(['Acme'])), [{ name: 'Acme', ...UNSET }]);
});

test('030 leaves every bill-to unset when two companies are named WD Media, Inc', () => {
  const rows = billTo(migrated(['WD Media, Inc', 'WD Media, Inc']));
  assert.deepEqual(rows, [
    { name: 'WD Media, Inc', ...UNSET },
    { name: 'WD Media, Inc', ...UNSET },
  ]);
});

test('030 leaves bill-to unset for a near name', () => {
  assert.deepEqual(billTo(migrated(['WD Media Inc'])), [{ name: 'WD Media Inc', ...UNSET }]);
});

test('schema.sql has a company table with the six bill-to columns', () => {
  const start = schema.indexOf('CREATE TABLE `company`');
  assert.notEqual(start, -1, 'schema.sql is missing company');
  const cols = [...schema.slice(start, schema.indexOf(';', start)).matchAll(/^\s+`(\w+)` /gm)].map((m) => m[1]);
  assert.deepEqual(cols.slice(-6), BILL_TO);
});
