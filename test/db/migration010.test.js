const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const sql = fs.readFileSync(
  path.join(__dirname, '../../src/db/migrations/010_login_security.sql'),
  'utf8'
);
const schema = fs.readFileSync(path.join(__dirname, '../../src/db/schema.sql'), 'utf8');
const statements = sql.replace(/^--.*$/gm, '').split(';').map((s) => s.trim()).filter(Boolean);
const [session, token, backup, alterAdmin, alterClients, fillEmail] = statements;

const SECURITY_COLUMNS = [
  /email_verified_at DATETIME NULL/,
  /failed_logins INT NOT NULL DEFAULT 0/,
  /locked_until DATETIME NULL/,
  /totp_secret VARCHAR\(255\) NULL/,
  /totp_enabled_at DATETIME NULL/,
  /totp_last_step BIGINT NULL/,
];

test('migration 010 has six statements and a header with run order', () => {
  assert.equal(statements.length, 6);
  assert.match(sql, /after 009_auth_hotfix\.sql/);
  assert.match(sql, /BEFORE deploying/);
  assert.match(sql, /dry run on a database copy/);
});

test('creates auth_session', () => {
  assert.match(session, /^CREATE TABLE auth_session/);
  assert.match(session, /id CHAR\(64\) NOT NULL/);
  assert.match(session, /user_type ENUM\('admin','client'\) NOT NULL/);
  assert.match(session, /user_id INT NOT NULL/);
  assert.match(session, /created_at DATETIME NOT NULL/);
  assert.match(session, /expires_at DATETIME NOT NULL/);
  assert.match(session, /revoked_at DATETIME NULL/);
  assert.match(session, /PRIMARY KEY \(id\)/);
  assert.match(session, /KEY \w+ \(user_type, user_id\)/);
});

test('creates auth_token', () => {
  assert.match(token, /^CREATE TABLE auth_token/);
  assert.match(token, /id INT NOT NULL AUTO_INCREMENT/);
  assert.match(token, /purpose ENUM\('invite','reset','verify_email'\) NOT NULL/);
  assert.match(token, /user_type ENUM\('admin','client'\) NOT NULL/);
  assert.match(token, /user_id INT NULL/);
  assert.match(token, /email VARCHAR\(255\)/);
  assert.match(token, /name VARCHAR\(100\)/);
  assert.match(token, /company_id INT/);
  assert.match(token, /token_hash CHAR\(64\) NOT NULL/);
  assert.match(token, /created_by INT/);
  assert.match(token, /created_at DATETIME NOT NULL/);
  assert.match(token, /expires_at DATETIME NOT NULL/);
  assert.match(token, /used_at DATETIME NULL/);
  assert.match(token, /PRIMARY KEY \(id\)/);
  assert.match(token, /UNIQUE KEY \w+ \(token_hash\)/);
});

test('creates auth_backup_code', () => {
  assert.match(backup, /^CREATE TABLE auth_backup_code/);
  assert.match(backup, /id INT NOT NULL AUTO_INCREMENT/);
  assert.match(backup, /user_type ENUM\('admin','client'\) NOT NULL/);
  assert.match(backup, /user_id INT NOT NULL/);
  assert.match(backup, /code_hash CHAR\(64\) NOT NULL/);
  assert.match(backup, /used_at DATETIME NULL/);
  assert.match(backup, /PRIMARY KEY \(id\)/);
  assert.match(backup, /KEY \w+ \(user_type, user_id\)/);
});

test('adds the six security columns to admin', () => {
  assert.match(alterAdmin, /^ALTER TABLE admin/);
  SECURITY_COLUMNS.forEach((col) => assert.match(alterAdmin, new RegExp('ADD COLUMN ' + col.source)));
});

test('adds security columns, unique email and nullable username to clients', () => {
  assert.match(alterClients, /^ALTER TABLE clients/);
  SECURITY_COLUMNS.forEach((col) => assert.match(alterClients, new RegExp('ADD COLUMN ' + col.source)));
  assert.match(alterClients, /ADD COLUMN email VARCHAR\(255\) NULL/);
  assert.match(alterClients, /ADD UNIQUE KEY uniq_clients_email \(email\)/);
  assert.match(alterClients, /MODIFY username VARCHAR\(255\) NULL/);
});

test('fills client email from email-like usernames only when empty', () => {
  assert.match(fillEmail, /^UPDATE clients SET email = LOWER\(TRIM\(username\)\)/);
  assert.match(fillEmail, /email IS NULL/);
  assert.match(fillEmail, /username LIKE '%_@_%\._%'|username LIKE '%_@_%._%'/);
});

test('schema.sql shows the new tables and admin columns', () => {
  ['auth_session', 'auth_token', 'auth_backup_code'].forEach((t) =>
    assert.match(schema, new RegExp('CREATE TABLE `' + t + '`'))
  );
  const adminTable = schema.slice(schema.indexOf('CREATE TABLE `admin`'), schema.indexOf('CREATE TABLE `expense`'));
  assert.match(adminTable, /`email_verified_at` datetime DEFAULT NULL/);
  assert.match(adminTable, /`failed_logins` int NOT NULL DEFAULT '0'/);
  assert.match(adminTable, /`locked_until` datetime DEFAULT NULL/);
  assert.match(adminTable, /`totp_secret` varchar\(255\) DEFAULT NULL/);
  assert.match(adminTable, /`totp_enabled_at` datetime DEFAULT NULL/);
  assert.match(adminTable, /`totp_last_step` bigint DEFAULT NULL/);
});
