const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { createMigrationDb } = require('../helpers/migrationSqlite');

const migration = fs.readFileSync(
  path.join(__dirname, '../../src/db/migrations/024_qc_markings.sql'),
  'utf8'
);
const schema = fs.readFileSync(path.join(__dirname, '../../src/db/schema.sql'), 'utf8');

const STUBS = `
CREATE TABLE company (id INT NOT NULL AUTO_INCREMENT, name VARCHAR(100) NOT NULL, PRIMARY KEY (id)) ENGINE=InnoDB;
CREATE TABLE part (id INT NOT NULL AUTO_INCREMENT, number VARCHAR(50) NOT NULL, PRIMARY KEY (id)) ENGINE=InnoDB;
CREATE TABLE job (id INT NOT NULL AUTO_INCREMENT, PRIMARY KEY (id)) ENGINE=InnoDB;
CREATE TABLE uploaded_files (id INT NOT NULL AUTO_INCREMENT, name VARCHAR(100) NOT NULL, PRIMARY KEY (id)) ENGINE=InnoDB;
`;

const QC_TABLES = ['qc_marking', 'qc_photo', 'qc_ping'];

const tableFromSchema = (name) => {
  const start = schema.indexOf(`CREATE TABLE \`${name}\``);
  assert.notEqual(start, -1, `schema.sql is missing ${name}`);
  return `${schema.slice(start, schema.indexOf(';', start))};`;
};

const NOW = '2026-01-01 00:00:00';

const insertMarking = (db, { part = 1, file = 1, company = null } = {}) =>
  Number(db.prepare(
    `INSERT INTO qc_marking (part_id, file_id, page, company_id, kind, x1, y1, x2, y2, size, note, author_id, author_name, created_at, updated_at)
     VALUES (?, ?, 1, ?, 'box', 0.1, 0.2, 0.5, 0.6, NULL, 'check', 'u', 'U', ?, ?)`
  ).run(part, file, company, NOW, NOW).lastInsertRowid);

const insertPhoto = (db, markingId, jobId = 1) =>
  Number(db.prepare(
    `INSERT INTO qc_photo (marking_id, job_id, position, mimetype, size, content, uploaded_by_name, uploaded_at)
     VALUES (?, ?, 1, 'image/jpeg', 3, X'010203', 'U', ?)`
  ).run(markingId, jobId, NOW).lastInsertRowid);

const insertPing = (db, part, company) =>
  db.prepare(
    'INSERT INTO qc_ping (part_id, company_id, pinged_by_name, pinged_at, ping_count) VALUES (?, ?, ?, ?, 1)'
  ).run(part, company, 'U', NOW);

const count = (db, table) => db.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n;

const seed = (db) => {
  db.exec(`INSERT INTO company (name) VALUES ('c1'), ('c2');
    INSERT INTO part (number) VALUES ('P1'), ('P2');
    INSERT INTO job DEFAULT VALUES;
    INSERT INTO uploaded_files (name) VALUES ('d1'), ('d2')`);
};

const behaviorChecks = (label, build) => {
  test(`${label}: a marking keeps fractional coordinates and a NULL company`, () => {
    const { db } = build();
    seed(db);
    const id = insertMarking(db);
    const row = db.prepare('SELECT x1, y2, company_id FROM qc_marking WHERE id = ?').get(id);
    assert.equal(row.x1, 0.1);
    assert.equal(row.y2, 0.6);
    assert.equal(row.company_id, null);
  });

  test(`${label}: deleting a part, drawing file or company removes its markings`, () => {
    const { db } = build();
    seed(db);
    insertMarking(db, { part: 1, file: 1, company: 1 });
    insertMarking(db, { part: 2, file: 1, company: 1 });
    insertMarking(db, { part: 2, file: 2, company: 1 });
    insertMarking(db, { part: 2, file: 2, company: 2 });
    db.exec('DELETE FROM part WHERE id = 1');
    assert.equal(count(db, 'qc_marking'), 3);
    db.exec('DELETE FROM uploaded_files WHERE id = 1');
    assert.equal(count(db, 'qc_marking'), 2);
    db.exec('DELETE FROM company WHERE id = 1');
    assert.equal(count(db, 'qc_marking'), 1);
  });

  test(`${label}: deleting a marking removes its photos only`, () => {
    const { db } = build();
    seed(db);
    const a = insertMarking(db);
    const b = insertMarking(db);
    insertPhoto(db, a);
    insertPhoto(db, b);
    db.exec(`DELETE FROM qc_marking WHERE id = ${a}`);
    assert.equal(count(db, 'qc_photo'), 1);
  });

  test(`${label}: deleting a job removes its photos but keeps the marking`, () => {
    const { db } = build();
    seed(db);
    insertPhoto(db, insertMarking(db));
    db.exec('DELETE FROM job WHERE id = 1');
    assert.equal(count(db, 'qc_photo'), 0);
    assert.equal(count(db, 'qc_marking'), 1);
  });

  test(`${label}: a photo cannot point at a missing marking`, () => {
    const { db } = build();
    seed(db);
    assert.throws(() => insertPhoto(db, 999), /FOREIGN KEY/);
  });

  test(`${label}: a second ping for one part and company is rejected`, () => {
    const { db } = build();
    seed(db);
    insertPing(db, 1, 1);
    assert.throws(() => insertPing(db, 1, 1), /UNIQUE/);
    insertPing(db, 1, 2);
    insertPing(db, 2, 1);
    assert.equal(count(db, 'qc_ping'), 3);
  });

  test(`${label}: deleting a part or company removes its pings`, () => {
    const { db } = build();
    seed(db);
    insertPing(db, 1, 1);
    insertPing(db, 2, 2);
    db.exec('DELETE FROM part WHERE id = 1');
    assert.equal(count(db, 'qc_ping'), 1);
    db.exec('DELETE FROM company WHERE id = 2');
    assert.equal(count(db, 'qc_ping'), 0);
  });
};

behaviorChecks('after migration 024', () => {
  const mdb = createMigrationDb();
  mdb.run(STUBS);
  mdb.run(migration);
  return mdb;
});

behaviorChecks('schema.sql', () => {
  const mdb = createMigrationDb();
  mdb.run(STUBS);
  mdb.run(QC_TABLES.map(tableFromSchema).join('\n'));
  return mdb;
});

test('the helper maps DOUBLE and MEDIUMBLOB but still rejects other types', () => {
  const mdb = createMigrationDb();
  mdb.run('CREATE TABLE t (id INT NOT NULL AUTO_INCREMENT, a DOUBLE NOT NULL, b MEDIUMBLOB NOT NULL, PRIMARY KEY (id)) ENGINE=InnoDB');
  assert.throws(() => mdb.run('CREATE TABLE u (id INT NOT NULL, z LONGBLOB NOT NULL) ENGINE=InnoDB'), /unsupported column type/);
});
