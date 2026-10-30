const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const sql = fs.readFileSync(
  path.join(__dirname, '../../src/db/migrations/018_printing.sql'),
  'utf8'
);
const schema = fs.readFileSync(path.join(__dirname, '../../src/db/schema.sql'), 'utf8');
const statements = sql.replace(/^--.*$/gm, '').split(';').map((s) => s.trim()).filter(Boolean);

const table = (name) => {
  const start = schema.indexOf(`CREATE TABLE \`${name}\``);
  assert.notEqual(start, -1, `schema.sql is missing ${name}`);
  return schema.slice(start, schema.indexOf(';', start));
};
const create = (name) => statements.find((s) => s.startsWith(`CREATE TABLE ${name} (`));

test('migration 018 has the run order header', () => {
  assert.match(sql, /after 017_admin_part_lists\.sql/);
  assert.match(sql, /back up the database first/);
  assert.match(sql, /dry run on a database copy/);
  assert.match(sql, /BEFORE deploying/);
});

test('migration only creates three tables and seeds two printers', () => {
  assert.equal(statements.length, 5);
  assert.equal(statements.filter((s) => s.startsWith('CREATE TABLE ')).length, 3);
  assert.equal(statements.filter((s) => s.startsWith('INSERT INTO printer ')).length, 2);
  assert.doesNotMatch(statements.join(';').replace(/ON DELETE CASCADE/g, ''), /ALTER|DROP|DELETE/i);
});

test('printer has its columns', () => {
  const printer = create('printer');
  assert.ok(printer);
  for (const col of [
    'id INT NOT NULL AUTO_INCREMENT',
    'name VARCHAR(100) NOT NULL',
    'cups_queue VARCHAR(100) NOT NULL',
    "role ENUM('letter','label') NOT NULL",
    'media VARCHAR(50) NOT NULL',
    'copies JSON NOT NULL',
    'enabled TINYINT(1) NOT NULL DEFAULT 1',
    'created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP',
    'updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
  ]) {
    assert.ok(printer.includes(col), `printer is missing ${col}`);
  }
});

test('print_job has its columns, keys and status index', () => {
  const job = create('print_job');
  assert.ok(job);
  for (const col of [
    'file_id INT NOT NULL',
    'printer_id INT NOT NULL',
    'kind VARCHAR(20) NOT NULL',
    'copies INT NOT NULL',
    'options JSON',
    "status ENUM('queued','sent','printed','failed','expired') NOT NULL DEFAULT 'queued'",
    'attempts INT NOT NULL DEFAULT 0',
    'lp_job_id VARCHAR(100)',
    'error TEXT',
    'requested_by_id VARCHAR(255) NOT NULL',
    'requested_by_name VARCHAR(255) NOT NULL',
    'created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP',
    'claimed_at DATETIME',
    'finished_at DATETIME',
    'KEY idx_print_job_status (status, created_at)',
    'FOREIGN KEY (file_id) REFERENCES uploaded_files (id) ON DELETE CASCADE',
    'FOREIGN KEY (printer_id) REFERENCES printer (id)',
  ]) {
    assert.ok(job.includes(col), `print_job is missing ${col}`);
  }
});

test('print_agent has a unique 64 char token hash', () => {
  const agent = create('print_agent');
  assert.ok(agent);
  assert.ok(agent.includes('token_hash CHAR(64) NOT NULL'));
  assert.ok(agent.includes('UNIQUE KEY uq_print_agent_token (token_hash)'));
  assert.ok(agent.includes('created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP'));
  assert.ok(agent.includes('last_seen_at DATETIME'));
});

test('seeds the Brother letter printer with 2 packing copies and the thermal label printer', () => {
  const [brother, label] = statements.filter((s) => s.startsWith('INSERT INTO printer '));
  const parse = (stmt) => {
    const m = /VALUES\s+\('([^']*)', '([^']*)', '([^']*)', '([^']*)',\s+'(\{.*\})'\)/s.exec(stmt);
    assert.ok(m, 'unexpected insert shape');
    return { name: m[1], queue: m[2], role: m[3], media: m[4], copies: JSON.parse(m[5]) };
  };
  const kinds = ['quote', 'order', 'invoice', 'packing', 'shipping', 'drawing', 'file'];
  const ones = Object.fromEntries(kinds.map((k) => [k, 1]));
  assert.deepEqual(parse(brother), {
    name: 'Brother', queue: 'Brother_HL_L2305_series', role: 'letter', media: 'Letter',
    copies: { ...ones, packing: 2 },
  });
  assert.deepEqual(parse(label), {
    name: 'Thermal label', queue: 'Printer_ThermalPrinter', role: 'label', media: '4x6',
    copies: ones,
  });
});

test('schema.sql shows the three tables in dump style after admin_part_list_item', () => {
  const printer = table('printer');
  assert.ok(printer.includes("`role` enum('letter','label') NOT NULL"));
  assert.ok(printer.includes('`copies` json NOT NULL'));
  assert.ok(printer.includes('`enabled` tinyint(1) NOT NULL DEFAULT 1'));
  const job = table('print_job');
  assert.ok(job.includes("`status` enum('queued','sent','printed','failed','expired') NOT NULL DEFAULT 'queued'"));
  assert.ok(job.includes('KEY `idx_print_job_status` (`status`,`created_at`)'));
  assert.ok(job.includes('FOREIGN KEY (`file_id`) REFERENCES `uploaded_files` (`id`) ON DELETE CASCADE'));
  assert.ok(job.includes('FOREIGN KEY (`printer_id`) REFERENCES `printer` (`id`)'));
  const agent = table('print_agent');
  assert.ok(agent.includes('`token_hash` char(64) NOT NULL'));
  assert.ok(agent.includes('UNIQUE KEY `uq_print_agent_token` (`token_hash`)'));
  assert.ok(schema.indexOf('CREATE TABLE `admin_part_list_item`') < schema.indexOf('CREATE TABLE `printer`'));
});
