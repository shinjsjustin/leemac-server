const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { createMigrationDb } = require('../helpers/migrationSqlite');

const migration = fs.readFileSync(
  path.join(__dirname, '../../src/db/migrations/023_shared_part_lists.sql'),
  'utf8'
);
const schema = fs.readFileSync(path.join(__dirname, '../../src/db/schema.sql'), 'utf8');

const PRE_023 = `
CREATE TABLE company (id INT NOT NULL AUTO_INCREMENT, name VARCHAR(100) NOT NULL, PRIMARY KEY (id)) ENGINE=InnoDB;
CREATE TABLE part (id INT NOT NULL AUTO_INCREMENT, number VARCHAR(50) NOT NULL, PRIMARY KEY (id)) ENGINE=InnoDB;
CREATE TABLE part_list (
  id INT NOT NULL AUTO_INCREMENT, company_id INT NOT NULL, name VARCHAR(100) NOT NULL,
  PRIMARY KEY (id), KEY idx_part_list_company (company_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE part_list_item (
  id INT NOT NULL AUTO_INCREMENT, list_id INT NOT NULL, part_id INT NOT NULL, added_at DATETIME NOT NULL,
  PRIMARY KEY (id), UNIQUE KEY uq_part_list_item (list_id, part_id),
  FOREIGN KEY (list_id) REFERENCES part_list (id) ON DELETE CASCADE,
  FOREIGN KEY (part_id) REFERENCES part (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE admin_part_list (
  id INT NOT NULL AUTO_INCREMENT, name VARCHAR(100) NOT NULL,
  created_by_id VARCHAR(255) NOT NULL, created_by_name VARCHAR(255) NOT NULL,
  updated_by_id VARCHAR(255) NOT NULL, updated_by_name VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE admin_part_list_item (
  id INT NOT NULL AUTO_INCREMENT, list_id INT NOT NULL, part_id INT NOT NULL, added_at DATETIME NOT NULL,
  PRIMARY KEY (id), UNIQUE KEY uq_admin_part_list_item (list_id, part_id),
  FOREIGN KEY (list_id) REFERENCES admin_part_list (id) ON DELETE CASCADE,
  FOREIGN KEY (part_id) REFERENCES part (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;

const STUBS = `
CREATE TABLE company (id INT NOT NULL AUTO_INCREMENT, name VARCHAR(100) NOT NULL, PRIMARY KEY (id)) ENGINE=InnoDB;
CREATE TABLE part (id INT NOT NULL AUTO_INCREMENT, number VARCHAR(50) NOT NULL, PRIMARY KEY (id)) ENGINE=InnoDB;
`;

const tableFromSchema = (name) => {
  const start = schema.indexOf(`CREATE TABLE \`${name}\``);
  assert.notEqual(start, -1, `schema.sql is missing ${name}`);
  return `${schema.slice(start, schema.indexOf(';', start))};`;
};

const NOW = '2026-01-01 00:00:00';

const insertList = (db, name, token = null) =>
  Number(db.prepare(
    `INSERT INTO admin_part_list (name, created_by_id, created_by_name, updated_by_id, updated_by_name, created_at, updated_at, share_token)
     VALUES (?, 'u', 'U', 'u', 'U', ?, ?, ?)`
  ).run(name, NOW, NOW, token).lastInsertRowid);

const insertItem = (db, listId, partId, companyId = null) =>
  Number(db.prepare(
    'INSERT INTO admin_part_list_item (list_id, part_id, added_at, added_by_company_id) VALUES (?, ?, ?, ?)'
  ).run(listId, partId, NOW, companyId).lastInsertRowid);

const insertMember = (db, listId, companyId) =>
  db.prepare(
    "INSERT INTO admin_part_list_member (list_id, company_id, joined_by_id, joined_by_name, joined_at) VALUES (?, ?, 'u', 'U', ?)"
  ).run(listId, companyId, NOW);

const count = (db, sql, ...args) => db.prepare(sql).get(...args).n;

// The behavior every shared-list database must show, however its tables were built.
const behaviorChecks = (label, build) => {
  test(`${label}: a duplicate share token is rejected but two NULL tokens are allowed`, () => {
    const { db } = build();
    insertList(db, 'a', 'tok');
    assert.throws(() => insertList(db, 'b', 'tok'), /UNIQUE/);
    insertList(db, 'c');
    insertList(db, 'd');
    assert.equal(count(db, 'SELECT COUNT(*) n FROM admin_part_list WHERE share_token IS NULL'), 2);
  });

  test(`${label}: a second member row for one list and company is rejected`, () => {
    const { db } = build();
    db.exec("INSERT INTO company (name) VALUES ('c1'), ('c2')");
    const list = insertList(db, 'a');
    insertMember(db, list, 1);
    assert.throws(() => insertMember(db, list, 1), /UNIQUE/);
    insertMember(db, list, 2);
  });

  test(`${label}: deleting the list or the company removes member rows`, () => {
    const { db } = build();
    db.exec("INSERT INTO company (name) VALUES ('c1'), ('c2')");
    const l1 = insertList(db, 'a');
    const l2 = insertList(db, 'b');
    insertMember(db, l1, 1);
    insertMember(db, l2, 2);
    db.exec(`DELETE FROM admin_part_list WHERE id = ${l1}`);
    assert.equal(count(db, 'SELECT COUNT(*) n FROM admin_part_list_member WHERE list_id = ?', l1), 0);
    db.exec('DELETE FROM company WHERE id = 2');
    assert.equal(count(db, 'SELECT COUNT(*) n FROM admin_part_list_member'), 0);
  });

  test(`${label}: deleting a company sets added_by_company_id to NULL and keeps the item`, () => {
    const { db } = build();
    db.exec("INSERT INTO company (name) VALUES ('c1'); INSERT INTO part (number) VALUES ('P1')");
    const list = insertList(db, 'a');
    const item = insertItem(db, list, 1, 1);
    db.exec('DELETE FROM company WHERE id = 1');
    const row = db.prepare('SELECT added_by_company_id FROM admin_part_list_item WHERE id = ?').get(item);
    assert.equal(row.added_by_company_id, null);
  });

  test(`${label}: a member row cannot point at a missing list or company`, () => {
    const { db } = build();
    db.exec("INSERT INTO company (name) VALUES ('c1')");
    const list = insertList(db, 'a');
    assert.throws(() => insertMember(db, 999, 1), /FOREIGN KEY/);
    assert.throws(() => insertMember(db, list, 999), /FOREIGN KEY/);
  });
};

const migrated = () => {
  const mdb = createMigrationDb();
  mdb.run(PRE_023);
  mdb.run(migration);
  return mdb;
};

test('pre-existing lists, items and client lists survive with private defaults', () => {
  const mdb = createMigrationDb();
  mdb.run(PRE_023);
  const { db } = mdb;
  db.exec("INSERT INTO company (name) VALUES ('c1'); INSERT INTO part (number) VALUES ('P1'), ('P2')");
  db.exec(`INSERT INTO admin_part_list (name, created_by_id, created_by_name, updated_by_id, updated_by_name, created_at, updated_at)
    VALUES ('old list', 'u', 'U', 'u', 'U', '${NOW}', '${NOW}')`);
  db.exec(`INSERT INTO admin_part_list_item (list_id, part_id, added_at) VALUES (1, 1, '${NOW}'), (1, 2, '${NOW}')`);
  db.exec("INSERT INTO part_list (company_id, name) VALUES (1, 'client list')");
  db.exec(`INSERT INTO part_list_item (list_id, part_id, added_at) VALUES (1, 1, '${NOW}')`);

  mdb.run(migration);

  const list = db.prepare('SELECT * FROM admin_part_list').get();
  assert.equal(list.name, 'old list');
  assert.equal(list.share_enabled, 0);
  assert.equal(list.share_token, null);
  const items = db.prepare('SELECT part_id, added_by_company_id FROM admin_part_list_item ORDER BY part_id').all();
  assert.deepEqual(items.map((i) => ({ ...i })), [
    { part_id: 1, added_by_company_id: null },
    { part_id: 2, added_by_company_id: null },
  ]);
  assert.equal(count(db, 'SELECT COUNT(*) n FROM part_list'), 1);
  assert.equal(count(db, 'SELECT COUNT(*) n FROM part_list_item'), 1);
});

test('rebuilding admin_part_list keeps the item cascade from the list', () => {
  const { db } = migrated();
  db.exec("INSERT INTO part (number) VALUES ('P1')");
  const list = insertList(db, 'a');
  insertItem(db, list, 1);
  db.exec(`DELETE FROM admin_part_list WHERE id = ${list}`);
  assert.equal(count(db, 'SELECT COUNT(*) n FROM admin_part_list_item'), 0);
});

behaviorChecks('after migration 023', migrated);

behaviorChecks('schema.sql', () => {
    const mdb = createMigrationDb();
    mdb.run(STUBS);
    mdb.run(['admin_part_list', 'admin_part_list_item', 'admin_part_list_member'].map(tableFromSchema).join('\n'));
    return mdb;
});

test('the helper throws on a clause it does not recognise', () => {
  const mdb = createMigrationDb();
  mdb.run(PRE_023);
  assert.throws(() => mdb.run('ALTER TABLE admin_part_list DROP COLUMN name'), /unsupported ALTER clause/);
  assert.throws(
    () => mdb.run('ALTER TABLE admin_part_list ADD FOREIGN KEY (id) REFERENCES company (id) ON UPDATE CASCADE'),
    /unsupported foreign key/
  );
  assert.throws(() => mdb.run('ALTER TABLE admin_part_list ADD COLUMN x BLOB NULL'), /unsupported column type/);
});
