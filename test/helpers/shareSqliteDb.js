const { makeQcDb } = require('./qcSqliteDb');

// Adds the columns and tables the share links read on top of the QC schema (migrations 019 and 028).
const EXTRA = `
ALTER TABLE company ADD COLUMN code TEXT;
ALTER TABLE job ADD COLUMN invoice_number TEXT;
ALTER TABLE uploaded_files ADD COLUMN mimetype TEXT;
ALTER TABLE uploaded_files ADD COLUMN content BLOB;
ALTER TABLE uploaded_files ADD COLUMN uploaded_at TEXT DEFAULT CURRENT_TIMESTAMP;
CREATE TABLE job_document (
  id INTEGER PRIMARY KEY AUTOINCREMENT, job_id INTEGER NOT NULL, type VARCHAR(20) NOT NULL,
  fields TEXT NOT NULL, parts TEXT NOT NULL, file_id INTEGER, saved_by_name TEXT, saved_at TEXT NOT NULL
);
CREATE TABLE share_link (
  id INTEGER PRIMARY KEY AUTOINCREMENT, type VARCHAR(10) NOT NULL, token VARCHAR(64) NOT NULL UNIQUE,
  job_id INTEGER, part_id INTEGER, company_id INTEGER NOT NULL,
  created_by_id VARCHAR(255) NOT NULL, created_by_name VARCHAR(255) NOT NULL,
  created_at TEXT NOT NULL, expires_at TEXT NOT NULL, turned_off_at TEXT,
  open_count INTEGER NOT NULL DEFAULT 0, last_opened_at TEXT
);
`;

function makeShareDb() {
    const db = makeQcDb();
    db.sqlite.exec(EXTRA);
    return db;
}

module.exports = { makeShareDb };
