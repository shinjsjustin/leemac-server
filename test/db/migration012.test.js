const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const sql = fs.readFileSync(
  path.join(__dirname, '../../src/db/migrations/012_quote_requests.sql'),
  'utf8'
);
const schema = fs.readFileSync(path.join(__dirname, '../../src/db/schema.sql'), 'utf8');
const statements = sql.replace(/^--.*$/gm, '').split(';').map((s) => s.trim()).filter(Boolean);
const [request, line, file] = statements;

const schemaTable = (name) => {
  const start = schema.indexOf(`CREATE TABLE \`${name}\``);
  assert.notEqual(start, -1, `schema.sql is missing ${name}`);
  const end = schema.indexOf('ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;', start);
  assert.notEqual(end, -1);
  return schema.slice(start, end);
};

const requestCols = [
  'id INT NOT NULL AUTO_INCREMENT',
  'company_id VARCHAR(100) NOT NULL',
  'client_id VARCHAR(100) NOT NULL',
  'client_name VARCHAR(100) NOT NULL',
  'name VARCHAR(100) NULL',
  'need_by DATE NULL',
  'note TEXT NULL',
  "status ENUM('draft','sent','in_review','job_created') NOT NULL DEFAULT 'draft'",
  'job_id INT NULL',
  'created_at DATETIME NOT NULL',
  'updated_at DATETIME NOT NULL',
  'submitted_at DATETIME NULL',
  'reviewed_at DATETIME NULL',
];
const lineCols = [
  'id INT NOT NULL AUTO_INCREMENT',
  'request_id INT NOT NULL',
  'position INT NOT NULL',
  'part_number VARCHAR(100) NULL',
  'description VARCHAR(255) NULL',
  'rev VARCHAR(10) NULL',
  'material VARCHAR(100) NULL',
  'finish VARCHAR(100) NULL',
  'quantity INT NULL',
  'price DECIMAL(10,2) NULL',
  'part_id INT NULL',
  'bourne_suggestion JSON NULL',
];
const fileCols = [
  'id INT NOT NULL AUTO_INCREMENT',
  'request_id INT NOT NULL',
  'line_id INT NULL',
  'filename VARCHAR(255) NOT NULL',
  'mimetype VARCHAR(100) NOT NULL',
  'size INT NOT NULL',
  'content LONGBLOB NOT NULL',
  'uploaded_at DATETIME NOT NULL',
];

// schema.sql is a mysqldump style: lowercase types, DEFAULT NULL, backticks.
const dumpStyle = (col) => {
  const [name, ...rest] = col.split(' ');
  const type = rest.join(' ')
    .replace(/^[A-Z]+(\([^)]*\))?/, (m) => m.toLowerCase())
    .replace(/(?<!NOT) NULL$/, ' DEFAULT NULL');
  return `\`${name}\` ${type}`;
};

const tables = [
  ['quote_request', requestCols],
  ['quote_request_line', lineCols],
  ['quote_request_file', fileCols],
];

test('migration 012 has three CREATE TABLEs and a header with run order', () => {
  assert.equal(statements.length, 3);
  statements.forEach((s) => assert.match(s, /^CREATE TABLE quote_request/));
  assert.match(sql, /after 011_trusted_device\.sql/);
  assert.match(sql, /BEFORE deploying/);
  assert.match(sql, /dry run on a database copy/);
});

test('migration tables have every column with the right type and nullability', () => {
  [request, line, file].forEach((stmt, i) => {
    tables[i][1].forEach((col) => assert.ok(stmt.includes(col), `${tables[i][0]}: ${col}`));
    assert.match(stmt, /PRIMARY KEY \(id\)/);
  });
});

test('migration keys and cascading foreign keys', () => {
  assert.match(request, /KEY idx_quote_request_company \(company_id, status\)/);
  assert.match(line, /KEY idx_quote_request_line_request \(request_id\)/);
  assert.match(file, /KEY idx_quote_request_file_request \(request_id\)/);
  assert.match(line, /FOREIGN KEY \(request_id\) REFERENCES quote_request \(id\) ON DELETE CASCADE/);
  assert.match(file, /FOREIGN KEY \(request_id\) REFERENCES quote_request \(id\) ON DELETE CASCADE/);
  assert.match(file, /FOREIGN KEY \(line_id\) REFERENCES quote_request_line \(id\) ON DELETE CASCADE/);
});

test('schema.sql has matching tables, columns, keys and cascades', () => {
  tables.forEach(([name, cols]) => {
    const t = schemaTable(name);
    cols.forEach((col) => {
      assert.ok(t.includes(dumpStyle(col)), `${name}: ${dumpStyle(col)}`);
    });
    assert.match(t, /PRIMARY KEY \(`id`\)/);
  });
  assert.match(schemaTable('quote_request'), /KEY `idx_quote_request_company` \(`company_id`,`status`\)/);
  assert.match(schemaTable('quote_request_line'), /KEY `idx_quote_request_line_request` \(`request_id`\)/);
  assert.match(schemaTable('quote_request_file'), /KEY `idx_quote_request_file_request` \(`request_id`\)/);
  assert.match(schemaTable('quote_request_line'), /FOREIGN KEY \(`request_id`\) REFERENCES `quote_request` \(`id`\) ON DELETE CASCADE/);
  assert.match(schemaTable('quote_request_file'), /FOREIGN KEY \(`request_id`\) REFERENCES `quote_request` \(`id`\) ON DELETE CASCADE/);
  assert.match(schemaTable('quote_request_file'), /FOREIGN KEY \(`line_id`\) REFERENCES `quote_request_line` \(`id`\) ON DELETE CASCADE/);
  assert.match(schema, /ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;\s*$/);
});
