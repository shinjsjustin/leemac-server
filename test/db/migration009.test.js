const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const sql = fs.readFileSync(
  path.join(__dirname, '../../src/db/migrations/009_auth_hotfix.sql'),
  'utf8'
);
const schema = fs.readFileSync(path.join(__dirname, '../../src/db/schema.sql'), 'utf8');
const statements = sql.replace(/^--.*$/gm, '').split(';').map((s) => s.trim()).filter(Boolean);
const [alter, copy, disable, seed] = statements;

test('migration 009 has four statements and a header saying to run after 008', () => {
  assert.equal(statements.length, 4);
  assert.match(sql, /after 008_email_link\.sql/);
  assert.match(sql, /BEFORE deploying/);
});

test('adds admin.disabled', () => {
  assert.match(alter, /^ALTER TABLE admin ADD COLUMN disabled TINYINT\(1\) NOT NULL DEFAULT 0$/);
});

test('copies admins 6 and 7 into clients, guarded', () => {
  assert.match(copy, /^INSERT INTO clients \(username, name, password, company_id\)/);
  assert.match(copy, /SELECT email, name, password, company_id\s+FROM admin/);
  assert.match(copy, /id = 6 AND name LIKE '%Foster%'/);
  assert.match(copy, /id = 7 AND name LIKE '%Santiago%'/);
  assert.match(copy, /password IS NOT NULL/);
  assert.match(copy, /company_id IS NOT NULL/);
  assert.match(copy, /NOT EXISTS \(SELECT 1 FROM clients c WHERE c\.username = admin\.email\)/);
});

test('disables admins 6 and 7 and clears google tokens, same guard', () => {
  assert.match(disable, /^UPDATE admin SET disabled = 1,\s*google_access_token = NULL,\s*google_refresh_token = NULL/);
  assert.match(disable, /id = 6 AND name LIKE '%Foster%'/);
  assert.match(disable, /id = 7 AND name LIKE '%Santiago%'/);
});

test('seeds a disabled Client portal admin only when absent', () => {
  assert.match(seed, /^INSERT INTO admin \(name, title, access_level, email, password, disabled\)/);
  assert.match(seed, /'Client portal', 'Client notes', 0, 'client-portal@leemac\.invalid', NULL, 1/);
  assert.match(seed, /WHERE NOT EXISTS \(SELECT 1 FROM admin WHERE email = 'client-portal@leemac\.invalid'\)/);
});

test('schema.sql admin table has disabled', () => {
  const adminTable = schema.slice(schema.indexOf('CREATE TABLE `admin`'), schema.indexOf('CREATE TABLE `expense`'));
  assert.match(adminTable, /`disabled` tinyint\(1\) NOT NULL DEFAULT '0'/);
});
