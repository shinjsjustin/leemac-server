const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const sql = fs.readFileSync(
  path.join(__dirname, '../../src/db/migrations/017_admin_part_lists.sql'),
  'utf8'
);
const schema = fs.readFileSync(path.join(__dirname, '../../src/db/schema.sql'), 'utf8');
const statements = sql.replace(/^--.*$/gm, '').split(';').map((s) => s.trim()).filter(Boolean);

const table = (name) => {
  const start = schema.indexOf(`CREATE TABLE \`${name}\``);
  assert.notEqual(start, -1, `schema.sql is missing ${name}`);
  return schema.slice(start, schema.indexOf(';', start));
};

test('migration 017 has the run order header', () => {
  assert.match(sql, /after 016_star_flags\.sql/);
  assert.match(sql, /back up the database first/);
  assert.match(sql, /dry run on a database copy/);
  assert.match(sql, /BEFORE deploying/);
});

test('migration only creates the two admin list tables', () => {
  assert.equal(statements.length, 2);
  assert.match(statements[0], /^CREATE TABLE admin_part_list \(/);
  assert.match(statements[1], /^CREATE TABLE admin_part_list_item \(/);
  assert.doesNotMatch(statements.join(';').replace(/ON DELETE CASCADE/g, ''), /ALTER|DROP|DELETE/i);
});

test('admin_part_list_item is unique per list and part and cascades from both parents', () => {
  const item = statements[1];
  assert.match(item, /UNIQUE KEY uq_admin_part_list_item \(list_id, part_id\)/);
  assert.match(item, /FOREIGN KEY \(list_id\) REFERENCES admin_part_list \(id\) ON DELETE CASCADE/);
  assert.match(item, /FOREIGN KEY \(part_id\) REFERENCES part \(id\) ON DELETE CASCADE/);
});

test('admin_part_list has name, audit columns and no company', () => {
  const list = statements[0];
  assert.match(list, /id INT NOT NULL AUTO_INCREMENT/);
  assert.match(list, /name VARCHAR\(100\) NOT NULL/);
  for (const col of ['created_by_id', 'created_by_name', 'updated_by_id', 'updated_by_name']) {
    assert.match(list, new RegExp(`${col} VARCHAR\\(255\\) NOT NULL`));
  }
  assert.match(list, /created_at DATETIME NOT NULL/);
  assert.match(list, /updated_at DATETIME NOT NULL/);
  assert.doesNotMatch(list, /company_id/);
});

test('schema.sql shows both tables in dump style after part_list_item', () => {
  const list = table('admin_part_list');
  assert.ok(list.includes('`name` varchar(100) NOT NULL'));
  assert.ok(list.includes('`created_by_name` varchar(255) NOT NULL'));
  assert.ok(list.includes('`updated_at` datetime NOT NULL'));
  const item = table('admin_part_list_item');
  assert.ok(item.includes('UNIQUE KEY `uq_admin_part_list_item` (`list_id`,`part_id`)'));
  assert.ok(item.includes('FOREIGN KEY (`list_id`) REFERENCES `admin_part_list` (`id`) ON DELETE CASCADE'));
  assert.ok(item.includes('FOREIGN KEY (`part_id`) REFERENCES `part` (`id`) ON DELETE CASCADE'));
  assert.ok(schema.indexOf('CREATE TABLE `part_list_item`') < schema.indexOf('CREATE TABLE `admin_part_list`'));
});
