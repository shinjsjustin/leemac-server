const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { createMigrationDb } = require('../helpers/migrationSqlite');

const migration = fs.readFileSync(
  path.join(__dirname, '../../src/db/migrations/028_share_links.sql'),
  'utf8'
);
const schema = fs.readFileSync(path.join(__dirname, '../../src/db/schema.sql'), 'utf8');

const STUBS = `
CREATE TABLE company (id INT NOT NULL AUTO_INCREMENT, name VARCHAR(100) NOT NULL, PRIMARY KEY (id)) ENGINE=InnoDB;
CREATE TABLE part (id INT NOT NULL AUTO_INCREMENT, number VARCHAR(50) NOT NULL, PRIMARY KEY (id)) ENGINE=InnoDB;
CREATE TABLE job (id INT NOT NULL AUTO_INCREMENT, PRIMARY KEY (id)) ENGINE=InnoDB;
`;

const tableFromSchema = (name) => {
  const start = schema.indexOf(`CREATE TABLE \`${name}\``);
  assert.notEqual(start, -1, `schema.sql is missing ${name}`);
  return `${schema.slice(start, schema.indexOf(';', start))};`;
};

const NOW = '2026-01-01 00:00:00';
const LATER = '2026-02-01 00:00:00';

const insertLink = (db, { type = 'quote', token, job = null, part = null, company = 1 }) =>
  Number(db.prepare(
    `INSERT INTO share_link (type, token, job_id, part_id, company_id, created_by_id, created_by_name, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, 'u', 'U', ?, ?)`
  ).run(type, token, job, part, company, NOW, LATER).lastInsertRowid);

const count = (db) => db.prepare('SELECT COUNT(*) n FROM share_link').get().n;

const seed = (db) => {
  db.exec(`INSERT INTO company (name) VALUES ('c1'), ('c2');
    INSERT INTO part (number) VALUES ('P1'), ('P2');
    INSERT INTO job DEFAULT VALUES;
    INSERT INTO job DEFAULT VALUES`);
};

const behaviorChecks = (label, build) => {
  test(`${label}: a new link starts with zero opens and no turn-off or last-open time`, () => {
    const { db } = build();
    seed(db);
    const id = insertLink(db, { token: 'a', job: 1 });
    const row = db.prepare('SELECT open_count, turned_off_at, last_opened_at, part_id FROM share_link WHERE id = ?').get(id);
    assert.equal(row.open_count, 0);
    assert.equal(row.turned_off_at, null);
    assert.equal(row.last_opened_at, null);
    assert.equal(row.part_id, null);
  });

  test(`${label}: a second link with the same token is rejected`, () => {
    const { db } = build();
    seed(db);
    insertLink(db, { token: 'same', job: 1 });
    assert.throws(() => insertLink(db, { type: 'qc', token: 'same', part: 1 }), /UNIQUE/);
    insertLink(db, { token: 'other', job: 1 });
    assert.equal(count(db), 2);
  });

  test(`${label}: deleting a job removes only its links`, () => {
    const { db } = build();
    seed(db);
    insertLink(db, { token: 'a', job: 1 });
    insertLink(db, { token: 'b', job: 2 });
    insertLink(db, { type: 'qc', token: 'c', part: 1 });
    db.exec('DELETE FROM job WHERE id = 1');
    assert.equal(count(db), 2);
  });

  test(`${label}: deleting a part removes only its links`, () => {
    const { db } = build();
    seed(db);
    insertLink(db, { type: 'qc', token: 'a', part: 1 });
    insertLink(db, { type: 'qc', token: 'b', part: 2 });
    insertLink(db, { token: 'c', job: 1 });
    db.exec('DELETE FROM part WHERE id = 1');
    assert.equal(count(db), 2);
  });

  test(`${label}: deleting a company removes only its links`, () => {
    const { db } = build();
    seed(db);
    insertLink(db, { token: 'a', job: 1, company: 1 });
    insertLink(db, { token: 'b', job: 1, company: 2 });
    db.exec('DELETE FROM company WHERE id = 1');
    assert.equal(count(db), 1);
  });

  test(`${label}: a link cannot point at a missing job`, () => {
    const { db } = build();
    seed(db);
    assert.throws(() => insertLink(db, { token: 'a', job: 99 }), /FOREIGN KEY/);
  });
};

behaviorChecks('after migration 028', () => {
  const mdb = createMigrationDb();
  mdb.run(STUBS);
  mdb.run(migration);
  return mdb;
});

behaviorChecks('schema.sql', () => {
  const mdb = createMigrationDb();
  mdb.run(STUBS);
  mdb.run(tableFromSchema('share_link'));
  return mdb;
});
