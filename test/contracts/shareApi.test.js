const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { start } = require('../helpers/server');
const { makeShareDb } = require('../helpers/shareSqliteDb');
const contracts = require('../../src/client/src/api/contracts/shareApi.json');
const { createShareRouter } = require('../../src/routes/shareLinksPublic');

const TOKEN = contracts.openSharedQuote.body.token;
const EXPIRES = '2999-01-01 00:00:00';

// Part 1 and job 1 are Acme's. The token is unique, so each request gets a live link of its own type only.
// File 1 is a QC drawing with a Leemac marking (company NULL); photo 1 hangs off marking 1 on Acme's job.
function seed(type) {
    const db = makeShareDb();
    db.sqlite.exec(`
        INSERT INTO company (id, name, code) VALUES (10, 'Acme', 'AC');
        INSERT INTO part (id, number, description) VALUES (1, 'P-1', 'Bracket');
        INSERT INTO job (id, company_id, job_number, po_number) VALUES (1, 10, 'J1', 'PO-1');
        INSERT INTO job_part (job_id, part_id, quantity, details) VALUES (1, 1, 5, '');
        INSERT INTO uploaded_files (id, filename, mimetype, content, part_id, job_id, note_id, uploaded_at) VALUES
            (1, 'a.pdf', 'application/pdf', x'0102', 1, NULL, NULL, '2026-01-01 00:00:00'),
            (5, 'Quote-J1-20260101-000000-site.pdf', 'application/pdf', x'0910', NULL, 1, NULL, '2026-01-01 00:00:00');
        INSERT INTO job_document (job_id, type, fields, parts, file_id, saved_by_name, saved_at)
            VALUES (1, 'quote', '{}', '[]', 5, 'Boss', '2026-01-01 00:00:00');
        INSERT INTO qc_marking (id, part_id, file_id, page, company_id, kind, x1, y1, note, author_id, author_name, created_at, updated_at)
            VALUES (1, 1, 1, 1, NULL, 'point', 0.1, 0.2, 'note', '7', 'Boss', '2026-01-01', '2026-01-01');
        INSERT INTO qc_photo (id, marking_id, job_id, position, value, caption, mimetype, size, content)
            VALUES (1, 1, 1, 1, '5.01', 'shot', 'image/png', 2, x'aa');
        INSERT INTO share_link (type, token, job_id, part_id, company_id, created_by_id, created_by_name, created_at, expires_at)
            VALUES ('${type}', '${TOKEN}', ${type === 'quote' ? '1, NULL' : 'NULL, 1'}, 10, 7, 'Boss', '2026-01-01 00:00:00', '${EXPIRES}');
    `);
    return db;
}

async function send({ method, path, body }) {
    const app = express();
    app.use(express.json());
    app.use('/api/share', createShareRouter({ db: seed(path.startsWith('/share/quote') ? 'quote' : 'qc') }));
    const { baseUrl, close } = await start(app);
    try {
        const res = await fetch(`${baseUrl}/api${path}`, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        return res.status;
    } finally {
        await close();
    }
}

for (const [name, entry] of Object.entries(contracts)) {
    test(`${name} ${entry.method} ${entry.path} answers 200`, async () => {
        assert.equal(await send(entry), 200);
    });
}
