const { DatabaseSync } = require('node:sqlite');

const SCHEMA = `
CREATE TABLE company (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT);
CREATE TABLE job (id INTEGER PRIMARY KEY AUTOINCREMENT, company_id INTEGER, job_number TEXT);
CREATE TABLE part (id INTEGER PRIMARY KEY AUTOINCREMENT, number TEXT, description TEXT, company INTEGER);
CREATE TABLE job_part (id INTEGER PRIMARY KEY AUTOINCREMENT, job_id INTEGER, part_id INTEGER, details TEXT);
CREATE TABLE uploaded_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT, filename TEXT, mimetype TEXT, size INTEGER, content BLOB,
  uploaded_at TEXT, part_id INTEGER, note_id INTEGER, job_id INTEGER
);
CREATE TABLE admin_part_list (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
  created_by_id TEXT NOT NULL, created_by_name TEXT NOT NULL,
  updated_by_id TEXT NOT NULL, updated_by_name TEXT NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  share_token TEXT UNIQUE, share_enabled INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE admin_part_list_item (
  id INTEGER PRIMARY KEY AUTOINCREMENT, list_id INTEGER NOT NULL, part_id INTEGER NOT NULL,
  added_at TEXT NOT NULL, added_by_company_id INTEGER, UNIQUE (list_id, part_id)
);
CREATE TABLE admin_part_list_member (
  id INTEGER PRIMARY KEY AUTOINCREMENT, list_id INTEGER NOT NULL, company_id INTEGER NOT NULL,
  joined_by_id TEXT NOT NULL, joined_by_name TEXT NOT NULL, joined_at TEXT NOT NULL,
  UNIQUE (list_id, company_id)
);
`;

const toSqlite = (sql) =>
    sql
        .replace(/NOW\(\)/g, "datetime('now')")
        .replace(/INSERT IGNORE/gi, 'INSERT OR IGNORE')
        .replace(/\s+FOR UPDATE/gi, '');

// Real SQL on an in-memory sqlite, shaped like the mysql2 pool (execute + getConnection).
function makeSharedListsDb() {
    const sqlite = new DatabaseSync(':memory:');
    sqlite.exec(SCHEMA);
    const execute = async (sql, params = []) => {
        const text = toSqlite(sql);
        const stmt = sqlite.prepare(text);
        if (/^\s*SELECT/i.test(text)) return [stmt.all(...params).map((r) => ({ ...r }))];
        const r = stmt.run(...params);
        return [{ insertId: Number(r.lastInsertRowid), affectedRows: Number(r.changes) }];
    };
    const conn = {
        execute,
        beginTransaction: async () => sqlite.exec('BEGIN'),
        commit: async () => sqlite.exec('COMMIT'),
        rollback: async () => sqlite.exec('ROLLBACK'),
        release: () => {},
    };
    return { sqlite, execute, getConnection: async () => conn };
}

module.exports = { makeSharedListsDb };
