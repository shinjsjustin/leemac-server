const { DatabaseSync } = require('node:sqlite');

const SCHEMA = `
CREATE TABLE company (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT);
CREATE TABLE job (
  id INTEGER PRIMARY KEY AUTOINCREMENT, job_number TEXT, company_id INTEGER, po_number TEXT,
  po_date TEXT, due_date TEXT, ship_date TEXT, invoice_number TEXT, invoice_date TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP, attention TEXT,
  invoice_status TEXT DEFAULT 'waiting', total_cost REAL
);
CREATE TABLE part (id INTEGER PRIMARY KEY AUTOINCREMENT, number TEXT, description TEXT);
CREATE TABLE job_part (
  id INTEGER PRIMARY KEY AUTOINCREMENT, job_id INTEGER, part_id INTEGER, quantity INTEGER,
  price REAL, rev TEXT, details TEXT, note TEXT, material TEXT, finish TEXT
);
CREATE TABLE stars (
  id INTEGER PRIMARY KEY AUTOINCREMENT, job_part_id INTEGER UNIQUE, attention TEXT,
  status TEXT DEFAULT 'open', nfc_tag_id TEXT UNIQUE,
  urgent INTEGER DEFAULT 0, waiting INTEGER DEFAULT 0
);
CREATE TABLE star_status_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT, job_part_id INTEGER NOT NULL, job_id INTEGER NOT NULL,
  company_id INTEGER NOT NULL, from_status TEXT, to_status TEXT NOT NULL, source TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'status',
  changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE quote_request (id INTEGER PRIMARY KEY AUTOINCREMENT, company_id INTEGER, status TEXT);
CREATE TABLE uploaded_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT, part_id INTEGER, job_id INTEGER, note_id INTEGER,
  filename TEXT, mimetype TEXT, size INTEGER, uploaded_at TEXT DEFAULT CURRENT_TIMESTAMP, content BLOB
);
`;

// Real SQL on an in-memory sqlite, shaped like the mysql2 pool's execute().
function makeShopDb() {
    const sqlite = new DatabaseSync(':memory:');
    sqlite.exec(SCHEMA);
    async function execute(sql, params = []) {
        const stmt = sqlite.prepare(sql);
        if (/^\s*SELECT/i.test(sql)) return [stmt.all(...params).map((r) => ({ ...r }))];
        const r = stmt.run(...params);
        return [{ insertId: Number(r.lastInsertRowid), affectedRows: Number(r.changes) }];
    }
    return {
        sqlite,
        execute,
        async getConnection() {
            return {
                execute,
                beginTransaction: async () => sqlite.exec('BEGIN'),
                commit: async () => sqlite.exec('COMMIT'),
                rollback: async () => sqlite.exec('ROLLBACK'),
                release() {},
            };
        },
    };
}

module.exports = { makeShopDb };
