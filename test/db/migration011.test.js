const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const sql = fs.readFileSync(
  path.join(__dirname, '../../src/db/migrations/011_trusted_device.sql'),
  'utf8'
);
const schema = fs.readFileSync(path.join(__dirname, '../../src/db/schema.sql'), 'utf8');
const statements = sql.replace(/^--.*$/gm, '').split(';').map((s) => s.trim()).filter(Boolean);
const [device] = statements;

test('migration 011 has one statement and a header with run order', () => {
  assert.equal(statements.length, 1);
  assert.match(sql, /after 010_login_security\.sql/);
  assert.match(sql, /BEFORE deploying/);
  assert.match(sql, /dry run on a database copy/);
});

test('creates admin_trusted_device with every column and both keys', () => {
  assert.match(device, /^CREATE TABLE admin_trusted_device/);
  assert.match(device, /id INT NOT NULL AUTO_INCREMENT/);
  assert.match(device, /admin_id INT NOT NULL/);
  assert.match(device, /token_hash CHAR\(64\) NOT NULL/);
  assert.match(device, /label VARCHAR\(255\) NOT NULL/);
  assert.match(device, /created_at DATETIME NOT NULL/);
  assert.match(device, /last_used_at DATETIME NOT NULL/);
  assert.match(device, /expires_at DATETIME NOT NULL/);
  assert.match(device, /PRIMARY KEY \(id\)/);
  assert.match(device, /UNIQUE KEY uniq_admin_trusted_device_hash \(token_hash\)/);
  assert.match(device, /KEY idx_admin_trusted_device_admin \(admin_id\)/);
});

test('schema.sql has a matching admin_trusted_device table', () => {
  const start = schema.indexOf('CREATE TABLE `admin_trusted_device`');
  assert.notEqual(start, -1);
  const table = schema.slice(start);
  assert.match(table, /`id` int NOT NULL AUTO_INCREMENT/);
  assert.match(table, /`admin_id` int NOT NULL/);
  assert.match(table, /`token_hash` char\(64\) NOT NULL/);
  assert.match(table, /`label` varchar\(255\) NOT NULL/);
  assert.match(table, /`created_at` datetime NOT NULL/);
  assert.match(table, /`last_used_at` datetime NOT NULL/);
  assert.match(table, /`expires_at` datetime NOT NULL/);
  assert.match(table, /PRIMARY KEY \(`id`\)/);
  assert.match(table, /UNIQUE KEY `uniq_admin_trusted_device_hash` \(`token_hash`\)/);
  assert.match(table, /KEY `idx_admin_trusted_device_admin` \(`admin_id`\)/);
  assert.match(table, /ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;\s*$/);
});
