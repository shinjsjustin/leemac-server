const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const sql = fs.readFileSync(
  path.join(__dirname, '../../src/db/migrations/023_shared_part_lists.sql'),
  'utf8'
);
const schema = fs.readFileSync(path.join(__dirname, '../../src/db/schema.sql'), 'utf8');
const statements = sql.replace(/^--.*$/gm, '').split(';').map((s) => s.trim()).filter(Boolean);

const table = (name) => {
  const start = schema.indexOf(`CREATE TABLE \`${name}\``);
  assert.notEqual(start, -1, `schema.sql is missing ${name}`);
  return schema.slice(start, schema.indexOf(';', start));
};

test('migration 023 has the run order header', () => {
  assert.match(sql, /after 022_job_no_bid\.sql/);
  assert.match(sql, /back up the database first/i);
  assert.match(sql, /dry run on a database copy/);
  assert.match(sql, /BEFORE deploying/);
});

test('migration is additive with safe defaults and no client list changes', () => {
  assert.equal(statements.length, 3);
  assert.match(statements[0], /^ALTER TABLE admin_part_list\b/);
  assert.match(statements[1], /^ALTER TABLE admin_part_list_item\b/);
  assert.match(statements[2], /^CREATE TABLE admin_part_list_member \(/);
  assert.doesNotMatch(statements.join(';').replace(/ON DELETE (CASCADE|SET NULL)/g, ''), /DROP|DELETE|UPDATE|MODIFY/i);
  assert.doesNotMatch(sql.replace(/^--.*$/gm, ''), /\bpart_list\b|\bpart_list_item\b/);
  assert.match(statements[0], /ADD COLUMN share_token VARCHAR\(64\) NULL/);
  assert.match(statements[0], /UNIQUE KEY uq_admin_part_list_share_token \(share_token\)/);
  assert.match(statements[0], /ADD COLUMN share_enabled TINYINT\(1\) NOT NULL DEFAULT 0/);
  assert.match(statements[1], /ADD COLUMN added_by_company_id INT NULL/);
  assert.match(statements[1], /FOREIGN KEY \(added_by_company_id\) REFERENCES company \(id\) ON DELETE SET NULL/);
});

test('member is one row per list and company and cascades from both parents', () => {
  const m = statements[2];
  assert.match(m, /id INT NOT NULL AUTO_INCREMENT/);
  assert.match(m, /list_id INT NOT NULL/);
  assert.match(m, /company_id INT NOT NULL/);
  assert.match(m, /joined_by_id VARCHAR\(255\)/);
  assert.match(m, /joined_by_name VARCHAR\(255\)/);
  assert.match(m, /joined_at DATETIME/);
  assert.match(m, /UNIQUE KEY uq_admin_part_list_member \(list_id, company_id\)/);
  assert.match(m, /FOREIGN KEY \(list_id\) REFERENCES admin_part_list \(id\) ON DELETE CASCADE/);
  assert.match(m, /FOREIGN KEY \(company_id\) REFERENCES company \(id\) ON DELETE CASCADE/);
});

test('schema.sql mirrors the columns, keys and member table in dump style', () => {
  const list = table('admin_part_list');
  assert.ok(list.includes('`share_token` varchar(64) DEFAULT NULL'));
  assert.ok(list.includes('`share_enabled` tinyint(1) NOT NULL DEFAULT 0'));
  assert.ok(list.includes('UNIQUE KEY `uq_admin_part_list_share_token` (`share_token`)'));
  const item = table('admin_part_list_item');
  assert.ok(item.includes('`added_by_company_id` int DEFAULT NULL'));
  assert.ok(item.includes('FOREIGN KEY (`added_by_company_id`) REFERENCES `company` (`id`) ON DELETE SET NULL'));
  const m = table('admin_part_list_member');
  assert.ok(m.includes('UNIQUE KEY `uq_admin_part_list_member` (`list_id`,`company_id`)'));
  assert.ok(m.includes('FOREIGN KEY (`list_id`) REFERENCES `admin_part_list` (`id`) ON DELETE CASCADE'));
  assert.ok(m.includes('FOREIGN KEY (`company_id`) REFERENCES `company` (`id`) ON DELETE CASCADE'));
  assert.ok(schema.indexOf('CREATE TABLE `admin_part_list_item`') < schema.indexOf('CREATE TABLE `admin_part_list_member`'));
});
