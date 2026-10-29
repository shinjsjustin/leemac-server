const { DatabaseSync } = require('node:sqlite');

const SCHEMA = `
CREATE TABLE admin (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, email TEXT);
CREATE TABLE job (id INTEGER PRIMARY KEY AUTOINCREMENT, company_id INTEGER, job_number TEXT);
CREATE TABLE part (id INTEGER PRIMARY KEY AUTOINCREMENT, number TEXT);
CREATE TABLE job_part (id INTEGER PRIMARY KEY AUTOINCREMENT, job_id INTEGER, part_id INTEGER);
CREATE TABLE note (
  id INTEGER PRIMARY KEY AUTOINCREMENT, content TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'new',
  userid INTEGER NOT NULL, jobid INTEGER, created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  part_id INTEGER, company_id INTEGER, client_id INTEGER, client_name TEXT,
  shared INTEGER NOT NULL DEFAULT 0, updated_at TEXT
);
`;

// Real SQL on an in-memory sqlite, shaped like the mysql2 pool's execute().
function makeNotesDb() {
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

module.exports = { makeNotesDb };
