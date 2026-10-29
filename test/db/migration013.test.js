const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const sql = fs.readFileSync(
  path.join(__dirname, '../../src/db/migrations/013_part_lists.sql'),
  'utf8'
);
const schema = fs.readFileSync(path.join(__dirname, '../../src/db/schema.sql'), 'utf8');
const statements = sql.replace(/^--.*$/gm, '').split(';').map((s) => s.trim()).filter(Boolean);
const [list, item, alter] = statements;

const schemaTable = (name) => {
  const start = schema.indexOf(`CREATE TABLE \`${name}\``);
  assert.notEqual(start, -1, `schema.sql is missing ${name}`);
  const end = schema.indexOf('ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;', start);
  assert.notEqual(end, -1);
  return schema.slice(start, end);
};

const listCols = [
  'id INT NOT NULL AUTO_INCREMENT',
  'company_id INT NOT NULL',
  'name VARCHAR(100) NOT NULL',
  'created_by_id VARCHAR(100) NOT NULL',
  'created_by_name VARCHAR(100) NOT NULL',
  'updated_by_id VARCHAR(100) NOT NULL',
  'updated_by_name VARCHAR(100) NOT NULL',
  'created_at DATETIME NOT NULL',
  'updated_at DATETIME NOT NULL',
];
const itemCols = [
  'id INT NOT NULL AUTO_INCREMENT',
  'list_id INT NOT NULL',
  'part_id INT NOT NULL',
  'added_at DATETIME NOT NULL',
];
const sourceCol = 'source_part_id INT NULL';

// schema.sql is a mysqldump style: lowercase types, DEFAULT NULL, backticks.
const dumpStyle = (col) => {
  const [name, ...rest] = col.split(' ');
  const type = rest.join(' ')
    .replace(/^[A-Z]+(\([^)]*\))?/, (m) => m.toLowerCase())
    .replace(/(?<!NOT) NULL$/, ' DEFAULT NULL');
  return `\`${name}\` ${type}`;
};

test('migration 013 is CREATE part_list, CREATE part_list_item, ALTER line, with run order header', () => {
  assert.equal(statements.length, 3);
  assert.match(list, /^CREATE TABLE part_list \(/);
  assert.match(item, /^CREATE TABLE part_list_item \(/);
  assert.match(alter, /^ALTER TABLE quote_request_line ADD COLUMN source_part_id INT NULL$/);
  assert.match(sql, /after 012_quote_requests\.sql/);
  assert.match(sql, /BEFORE deploying/);
  assert.match(sql, /dry run on a database copy/);
});

test('migration tables have every column with the right type and nullability', () => {
  listCols.forEach((col) => assert.ok(list.includes(col), `part_list: ${col}`));
  itemCols.forEach((col) => assert.ok(item.includes(col), `part_list_item: ${col}`));
  assert.match(list, /PRIMARY KEY \(id\)/);
  assert.match(item, /PRIMARY KEY \(id\)/);
});

test('migration keys, unique pair and foreign keys', () => {
  assert.match(list, /KEY idx_part_list_company \(company_id\)/);
  assert.match(item, /UNIQUE KEY uq_part_list_item \(list_id, part_id\)/);
  assert.match(item, /FOREIGN KEY \(list_id\) REFERENCES part_list \(id\) ON DELETE CASCADE/);
  assert.match(item, /FOREIGN KEY \(part_id\) REFERENCES part \(id\)/);
});

test('schema.sql has matching tables, columns, keys and the source_part_id column', () => {
  const l = schemaTable('part_list');
  const i = schemaTable('part_list_item');
  listCols.forEach((col) => assert.ok(l.includes(dumpStyle(col)), dumpStyle(col)));
  itemCols.forEach((col) => assert.ok(i.includes(dumpStyle(col)), dumpStyle(col)));
  assert.match(l, /PRIMARY KEY \(`id`\)/);
  assert.match(i, /PRIMARY KEY \(`id`\)/);
  assert.match(l, /KEY `idx_part_list_company` \(`company_id`\)/);
  assert.match(i, /UNIQUE KEY `uq_part_list_item` \(`list_id`,`part_id`\)/);
  assert.match(i, /FOREIGN KEY \(`list_id`\) REFERENCES `part_list` \(`id`\) ON DELETE CASCADE/);
  assert.match(i, /FOREIGN KEY \(`part_id`\) REFERENCES `part` \(`id`\)/);
  const line = schemaTable('quote_request_line');
  assert.ok(line.includes(dumpStyle(sourceCol)), 'quote_request_line.source_part_id');
  assert.ok(
    line.indexOf('`bourne_suggestion`') < line.indexOf('`source_part_id`'),
    'source_part_id comes after bourne_suggestion'
  );
  assert.match(schema, /ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;\s*$/);
});
