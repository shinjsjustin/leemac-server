const { DatabaseSync } = require('node:sqlite');

// Runs a small, strict subset of MySQL DDL on node:sqlite so a migration's unique
// keys and delete rules can be exercised. Any clause it does not recognise throws,
// because silently dropping an ON DELETE or UNIQUE would fake a passing test.

const unsupported = (what, text) => {
  throw new Error(`migrationSqlite: unsupported ${what}: ${text.trim()}`);
};

const unquote = (s) => s.replace(/`/g, '');

const splitTopLevel = (text) => {
  const parts = [];
  let depth = 0;
  let current = '';
  for (const ch of text) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
};

const columnList = (text) => unquote(text).split(',').map((c) => c.trim());

const SQLITE_TYPES = [
  [/^int\b/i, 'INTEGER'],
  [/^tinyint\(1\)/i, 'INTEGER'],
  [/^varchar\(\d+\)/i, 'TEXT'],
  [/^datetime\b/i, 'TEXT'],
  [/^double\b/i, 'REAL'],
  [/^mediumblob\b/i, 'BLOB'],
];

const parseColumn = (def) => {
  let rest = def.trim();
  const name = unquote(rest.match(/^`?(\w+)`?\s+/)?.[1] ?? unsupported('column', def));
  rest = rest.replace(/^`?\w+`?\s+/, '');
  const typeHit = SQLITE_TYPES.find(([re]) => re.test(rest)) ?? unsupported('column type', def);
  rest = rest.replace(typeHit[0], '').trim();
  const column = { name, sqlType: typeHit[1], notNull: false, defaultValue: null, autoIncrement: false };
  const options = [
    [/^NOT NULL\b/i, () => { column.notNull = true; }],
    [/^NULL\b/i, () => {}],
    [/^AUTO_INCREMENT\b/i, () => { column.autoIncrement = true; }],
    [/^DEFAULT\s+(NULL|-?\d+|'[^']*')/i, (m) => { column.defaultValue = m[1].toUpperCase() === 'NULL' ? null : m[1]; }],
  ];
  while (rest) {
    const hit = options.map(([re, apply]) => [rest.match(re), apply]).find(([m]) => m);
    if (!hit) unsupported('column option', def);
    hit[1](hit[0]);
    rest = rest.slice(hit[0][0].length).trim();
  }
  return column;
};

const parseForeignKey = (text) => {
  const m = text.match(/^FOREIGN KEY\s*\(([^)]+)\)\s*REFERENCES\s+`?(\w+)`?\s*\(([^)]+)\)(?:\s+ON DELETE (CASCADE|SET NULL))?$/i);
  if (!m) unsupported('foreign key', text);
  return { cols: columnList(m[1]), refTable: m[2], refCols: columnList(m[3]), onDelete: m[4] ? m[4].toUpperCase() : null };
};

const parseUnique = (text) => {
  const m = text.match(/^UNIQUE KEY\s+`?(\w+)`?\s*\(([^)]+)\)$/i);
  if (!m) unsupported('unique key', text);
  return { name: m[1], cols: columnList(m[2]) };
};

const parseIndex = (text) => {
  const m = text.match(/^KEY\s+`?(\w+)`?\s*\(([^)]+)\)$/i);
  if (!m) unsupported('key', text);
  return { name: m[1], cols: columnList(m[2]) };
};

const parseTableBody = (body) => {
  const model = { columns: [], pk: [], uniques: [], indexes: [], fks: [] };
  for (const item of splitTopLevel(body)) {
    if (/^PRIMARY KEY\b/i.test(item)) {
      const m = item.match(/^PRIMARY KEY\s*\(([^)]+)\)$/i) ?? unsupported('primary key', item);
      model.pk = columnList(m[1]);
    } else if (/^UNIQUE KEY\b/i.test(item)) model.uniques.push(parseUnique(item));
    else if (/^KEY\b/i.test(item)) model.indexes.push(parseIndex(item));
    else if (/^FOREIGN KEY\b/i.test(item)) model.fks.push(parseForeignKey(item));
    else model.columns.push(parseColumn(item));
  }
  return model;
};

const emitTable = (name, model) => {
  const isRowId = model.pk.length === 1;
  const lines = model.columns.map((c) => {
    const inlinePk = isRowId && model.pk[0] === c.name && c.autoIncrement;
    const parts = [c.name, c.sqlType];
    if (inlinePk) parts.push('PRIMARY KEY AUTOINCREMENT');
    if (c.notNull) parts.push('NOT NULL');
    if (c.defaultValue !== null) parts.push(`DEFAULT ${c.defaultValue}`);
    return parts.join(' ');
  });
  const autoPk = model.columns.some((c) => c.autoIncrement && isRowId && model.pk[0] === c.name);
  if (model.pk.length && !autoPk) lines.push(`PRIMARY KEY (${model.pk.join(', ')})`);
  for (const u of model.uniques) lines.push(`CONSTRAINT ${u.name} UNIQUE (${u.cols.join(', ')})`);
  for (const f of model.fks) {
    const action = f.onDelete ? ` ON DELETE ${f.onDelete}` : '';
    lines.push(`FOREIGN KEY (${f.cols.join(', ')}) REFERENCES ${f.refTable} (${f.refCols.join(', ')})${action}`);
  }
  return `CREATE TABLE ${name} (\n  ${lines.join(',\n  ')}\n)`;
};

const statementsOf = (sql) =>
  sql.replace(/^\s*--.*$/gm, '').split(';').map((s) => s.trim()).filter(Boolean);

const TABLE_OPTIONS = /^\s*ENGINE=InnoDB(?:\s+DEFAULT CHARSET=utf8mb4)?\s*$/i;

function createMigrationDb() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  const models = new Map();

  const createIndexes = (name, model) => {
    for (const ix of model.indexes) db.exec(`CREATE INDEX ${name}_${ix.name} ON ${name} (${ix.cols.join(', ')})`);
  };

  const createTable = (sql) => {
    const m = sql.match(/^CREATE TABLE\s+`?(\w+)`?\s*\(([\s\S]*)\)([^)]*)$/i);
    if (!m) unsupported('CREATE TABLE', sql);
    if (!TABLE_OPTIONS.test(m[3])) unsupported('table option', m[3]);
    const model = parseTableBody(m[2]);
    models.set(m[1], model);
    db.exec(emitTable(m[1], model));
    createIndexes(m[1], model);
  };

  const applyClause = (model, clause) => {
    if (/^ADD COLUMN\b/i.test(clause)) model.columns.push(parseColumn(clause.replace(/^ADD COLUMN\s+/i, '')));
    else if (/^ADD UNIQUE KEY\b/i.test(clause)) model.uniques.push(parseUnique(clause.replace(/^ADD\s+/i, '')));
    else if (/^ADD FOREIGN KEY\b/i.test(clause)) model.fks.push(parseForeignKey(clause.replace(/^ADD\s+/i, '')));
    else unsupported('ALTER clause', clause);
  };

  // sqlite cannot add a key or foreign key in place, so rebuild the table and keep its rows.
  const alterTable = (sql) => {
    const m = sql.match(/^ALTER TABLE\s+`?(\w+)`?\s+([\s\S]+)$/i);
    if (!m) unsupported('ALTER TABLE', sql);
    const name = m[1];
    const old = models.get(name) ?? unsupported('ALTER of unknown table', name);
    const next = {
      columns: [...old.columns], pk: old.pk, uniques: [...old.uniques], indexes: old.indexes, fks: [...old.fks],
    };
    for (const clause of splitTopLevel(m[2])) applyClause(next, clause);
    const kept = old.columns.map((c) => c.name).join(', ');
    db.exec('PRAGMA foreign_keys = OFF');
    try {
      db.exec(emitTable(`${name}__new`, next));
      db.exec(`INSERT INTO ${name}__new (${kept}) SELECT ${kept} FROM ${name}`);
      db.exec(`DROP TABLE ${name}`);
      db.exec(`ALTER TABLE ${name}__new RENAME TO ${name}`);
      createIndexes(name, next);
    } finally {
      db.exec('PRAGMA foreign_keys = ON');
    }
    models.set(name, next);
  };

  const run = (sql) => {
    for (const statement of statementsOf(sql)) {
      if (/^CREATE TABLE\b/i.test(statement)) createTable(statement);
      else if (/^ALTER TABLE\b/i.test(statement)) alterTable(statement);
      else unsupported('statement', statement);
    }
  };

  return { db, run };
}

module.exports = { createMigrationDb };
