const { DatabaseSync } = require('node:sqlite');

const SCHEMA = `
CREATE TABLE part (id INTEGER PRIMARY KEY AUTOINCREMENT, number TEXT UNIQUE, description TEXT);
CREATE TABLE job (id INTEGER PRIMARY KEY AUTOINCREMENT, job_number TEXT, created_at TEXT);
CREATE TABLE job_part (id INTEGER PRIMARY KEY AUTOINCREMENT, job_id INTEGER, part_id INTEGER, price REAL, quantity INTEGER, rev TEXT, details TEXT);
CREATE TABLE quote_request (id INTEGER PRIMARY KEY AUTOINCREMENT, status TEXT, job_id INTEGER);
CREATE TABLE quote_request_line (id INTEGER PRIMARY KEY AUTOINCREMENT, request_id INTEGER, position INTEGER, part_number TEXT, description TEXT, quantity INTEGER, part_id INTEGER);
`;

// Real SQL on an in-memory sqlite, shaped like the mysql2 pool's execute().
function makeSqliteDb() {
    const sqlite = new DatabaseSync(':memory:');
    sqlite.exec(SCHEMA);
    return {
        sqlite,
        async execute(sql, params = []) {
            const text = sql.replace(/INSERT IGNORE/i, 'INSERT OR IGNORE');
            const stmt = sqlite.prepare(text);
            if (/^\s*SELECT/i.test(text)) return [stmt.all(...params).map((r) => ({ ...r }))];
            const r = stmt.run(...params);
            return [{ insertId: Number(r.lastInsertRowid), affectedRows: Number(r.changes) }];
        },
    };
}

module.exports = { makeSqliteDb };
