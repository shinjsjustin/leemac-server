const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { makeShopDb } = require('../helpers/shopSqliteDb');

const sql = fs.readFileSync(
  path.join(__dirname, '../../src/db/migrations/016_star_flags.sql'),
  'utf8'
);
const schema = fs.readFileSync(path.join(__dirname, '../../src/db/schema.sql'), 'utf8');
const statements = sql.replace(/^--.*$/gm, '').split(';').map((s) => s.trim()).filter(Boolean);

const table = (name) => {
  const start = schema.indexOf(`CREATE TABLE \`${name}\``);
  assert.notEqual(start, -1, `schema.sql is missing ${name}`);
  return schema.slice(start, schema.indexOf(';', start));
};

test('migration 016 has the run order header', () => {
  assert.match(sql, /after 015_star_status_history\.sql/);
  assert.match(sql, /back up the database first/);
  assert.match(sql, /dry run on a database copy/);
  assert.match(sql, /BEFORE deploying/);
});

test('migration adds the flag and kind columns, converts statuses, drops nothing', () => {
  const alters = statements.filter((s) => /^ALTER TABLE/i.test(s)).join('\n');
  assert.match(alters, /ALTER TABLE stars[\s\S]*ADD COLUMN urgent TINYINT\(1\) NOT NULL DEFAULT 0/);
  assert.match(alters, /ADD COLUMN waiting TINYINT\(1\) NOT NULL DEFAULT 0/);
  assert.match(
    alters,
    /ALTER TABLE star_status_history[\s\S]*ADD COLUMN kind ENUM\('status','urgent','waiting'\) NOT NULL DEFAULT 'status'/
  );
  assert.doesNotMatch(statements.join(';'), /DROP|DELETE/i);
});

test('migration turns urgent and waiting statuses into open with the flag set', async () => {
  const db = makeShopDb();
  for (const [jp, status] of [[1, 'urgent'], [2, 'waiting'], [3, 'open'], [4, 'done']]) {
    await db.execute('INSERT INTO stars (job_part_id, status) VALUES (?, ?)', [jp, status]);
  }
  const updates = statements.filter((s) => /^UPDATE/i.test(s));
  assert.equal(updates.length, 2);
  updates.forEach((u) => db.sqlite.exec(u));
  const [rows] = await db.execute('SELECT job_part_id, status, urgent, waiting FROM stars ORDER BY job_part_id');
  assert.deepEqual(rows, [
    { job_part_id: 1, status: 'open', urgent: 1, waiting: 0 },
    { job_part_id: 2, status: 'open', urgent: 0, waiting: 1 },
    { job_part_id: 3, status: 'open', urgent: 0, waiting: 0 },
    { job_part_id: 4, status: 'done', urgent: 0, waiting: 0 },
  ]);
});

test('schema.sql shows the new columns in dump style', () => {
  const stars = table('stars');
  assert.ok(stars.includes('`urgent` tinyint(1) NOT NULL DEFAULT 0'));
  assert.ok(stars.includes('`waiting` tinyint(1) NOT NULL DEFAULT 0'));
  assert.ok(table('star_status_history').includes("`kind` enum('status','urgent','waiting') NOT NULL DEFAULT 'status'"));
});

test('makeShopDb has flag, kind, invoice and quote_request columns', async () => {
  const db = makeShopDb();
  await db.execute('INSERT INTO stars (job_part_id) VALUES (?)', [1]);
  await db.execute(
    'INSERT INTO star_status_history (job_part_id, job_id, company_id, to_status, source) VALUES (?, ?, ?, ?, ?)',
    [1, 1, 1, 'open', 'admin']
  );
  await db.execute('INSERT INTO job (job_number, total_cost) VALUES (?, ?)', ['J1', 12.5]);
  await db.execute('INSERT INTO quote_request (company_id, status) VALUES (?, ?)', [3, 'new']);
  assert.deepEqual((await db.execute('SELECT urgent, waiting FROM stars'))[0], [{ urgent: 0, waiting: 0 }]);
  assert.deepEqual((await db.execute('SELECT kind FROM star_status_history'))[0], [{ kind: 'status' }]);
  assert.deepEqual((await db.execute('SELECT invoice_status, total_cost FROM job'))[0], [
    { invoice_status: 'waiting', total_cost: 12.5 },
  ]);
  assert.deepEqual((await db.execute('SELECT id, company_id, status FROM quote_request'))[0], [
    { id: 1, company_id: 3, status: 'new' },
  ]);
});
