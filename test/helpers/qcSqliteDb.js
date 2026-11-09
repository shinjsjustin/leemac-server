const { DatabaseSync } = require('node:sqlite');

// Mirrors migration 024 plus the tables the ownership rules read.
const SCHEMA = `
CREATE TABLE company (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT);
CREATE TABLE job (
  id INTEGER PRIMARY KEY AUTOINCREMENT, company_id INTEGER, job_number TEXT, po_number TEXT, ship_date TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE part (id INTEGER PRIMARY KEY AUTOINCREMENT, number TEXT, description TEXT);
CREATE TABLE job_part (id INTEGER PRIMARY KEY AUTOINCREMENT, job_id INTEGER, part_id INTEGER, quantity INTEGER, details TEXT);
CREATE TABLE uploaded_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT, filename TEXT, part_id INTEGER, job_id INTEGER, note_id INTEGER
);
CREATE TABLE qc_marking (
  id INTEGER PRIMARY KEY AUTOINCREMENT, part_id INTEGER NOT NULL, file_id INTEGER NOT NULL,
  page INTEGER NOT NULL, company_id INTEGER, kind TEXT NOT NULL,
  x1 REAL NOT NULL, y1 REAL NOT NULL, x2 REAL, y2 REAL, size REAL, note TEXT,
  author_id TEXT NOT NULL, author_name TEXT NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE qc_photo (
  id INTEGER PRIMARY KEY AUTOINCREMENT, marking_id INTEGER NOT NULL, job_id INTEGER NOT NULL,
  position INTEGER NOT NULL, value TEXT, caption TEXT, mimetype TEXT NOT NULL, size INTEGER NOT NULL,
  content BLOB NOT NULL DEFAULT x'', uploaded_by_name TEXT NOT NULL DEFAULT '',
  uploaded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE qc_ping (
  id INTEGER PRIMARY KEY AUTOINCREMENT, part_id INTEGER NOT NULL, company_id INTEGER NOT NULL,
  pinged_by_name TEXT NOT NULL, pinged_at TEXT NOT NULL, ping_count INTEGER NOT NULL, dismissed_at TEXT,
  UNIQUE (part_id, company_id)
);
`;

// Real SQL on an in-memory sqlite, shaped like the mysql2 pool's execute().
function makeQcDb() {
    const sqlite = new DatabaseSync(':memory:');
    sqlite.exec(SCHEMA);
    return {
        sqlite,
        async execute(sql, params = []) {
            const stmt = sqlite.prepare(sql);
            if (/^\s*SELECT/i.test(sql)) return [stmt.all(...params).map((r) => ({ ...r }))];
            const r = stmt.run(...params);
            return [{ insertId: Number(r.lastInsertRowid), affectedRows: Number(r.changes) }];
        },
    };
}

module.exports = { makeQcDb };
