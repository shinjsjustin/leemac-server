const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { start } = require('../helpers/server');
const { makeQcDb } = require('../helpers/qcSqliteDb');
const contracts = require('../../src/client/src/api/contracts/qcAdminApi.json');
const { createQcAdminRouter } = require('../../src/routes/qcAdmin');

const PHOTO = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const WRITE_LEVEL = 3;

// Marking 1 is Leemac's with photos 1 and 2; part 1 has a ping to dismiss.
function seed() {
    const db = makeQcDb();
    db.sqlite.exec(`
        INSERT INTO company (id, name) VALUES (10, 'Acme');
        INSERT INTO job (id, company_id, job_number, created_at) VALUES (1, 10, 'J-1', '2026-01-01');
        INSERT INTO part (id, number) VALUES (1, 'P-1');
        INSERT INTO job_part (job_id, part_id, quantity) VALUES (1, 1, 5);
        INSERT INTO uploaded_files (id, filename, part_id) VALUES (1, 'a.pdf', 1);
        INSERT INTO qc_marking (id, part_id, file_id, page, company_id, kind, x1, y1, size, author_id, author_name, created_at, updated_at)
            VALUES (1, 1, 1, 1, NULL, 'point', 0.1, 0.1, 5, '9', 'Leemac', 'now', 'now');
        INSERT INTO qc_ping (id, part_id, company_id, pinged_by_name, pinged_at, ping_count) VALUES (1, 1, 10, 'Alice', '2999-01-01', 1);
    `);
    db.sqlite.exec(`
        CREATE TABLE admin (id INTEGER PRIMARY KEY, name TEXT, email TEXT);
        INSERT INTO admin (id, name, email) VALUES (7, 'Ad Min', 'ad@leemac.test');
    `);
    const add = db.sqlite.prepare(
        "INSERT INTO qc_photo (id, marking_id, job_id, position, value, mimetype, size, content) VALUES (?, 1, 1, ?, '5.01', 'image/jpeg', ?, ?)"
    );
    add.run(1, 1, PHOTO.length, PHOTO);
    add.run(2, 2, PHOTO.length, PHOTO);
    return db;
}

// Builds the same multipart body the client does: the fixture's fields plus its file part.
function multipartBody(fields, file) {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) form.append(key, value);
    form.append(file.field, new Blob([PHOTO], { type: file.type }), file.name);
    return form;
}

async function send({ method, path, body, file }) {
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => { req.user = { id: 7, email: 'ad@leemac.test', role: 'admin', access_level: WRITE_LEVEL, access: WRITE_LEVEL }; next(); });
    app.use('/api/internal/qc', createQcAdminRouter({ db: seed() }));
    const { baseUrl, close } = await start(app);
    try {
        const res = await fetch(`${baseUrl}${path}`, {
            method,
            headers: body && !file ? { 'Content-Type': 'application/json' } : undefined,
            body: file ? multipartBody(body, file) : body ? JSON.stringify(body) : undefined,
        });
        return res.status;
    } finally {
        await close();
    }
}

for (const [name, entry] of Object.entries(contracts)) {
    test(`${name} ${entry.method} ${entry.path} answers 2xx`, async () => {
        const status = await send({ ...entry, path: `/api${entry.path}` });
        assert.ok(status >= 200 && status < 300, `got ${status}`);
    });
}
