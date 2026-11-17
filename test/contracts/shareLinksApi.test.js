const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { start } = require('../helpers/server');
const { makeShareDb } = require('../helpers/shareSqliteDb');
const contracts = require('../../src/client/src/api/contracts/shareLinksApi.json');
const { createShareLinksAdminRouter } = require('../../src/routes/shareLinksAdmin');

const WRITE_LEVEL = 3;

// Job 12 (company 10) has a saved quote; part 1 belongs to company 10; link 1 is live for turn-off.
function seed() {
    const db = makeShareDb();
    db.sqlite.exec(`
        INSERT INTO company (id, name) VALUES (10, 'Acme');
        INSERT INTO job (id, company_id, job_number, created_at) VALUES (12, 10, 'J-12', '2026-01-01');
        INSERT INTO part (id, number) VALUES (1, 'P-1');
        INSERT INTO job_part (job_id, part_id, quantity) VALUES (12, 1, 5);
        INSERT INTO job_document (job_id, type, fields, parts, saved_at) VALUES (12, 'quote', '{}', '[]', '2026-01-01');
        INSERT INTO share_link (id, type, token, job_id, company_id, created_by_id, created_by_name, created_at, expires_at)
            VALUES (1, 'quote', 'tok', 12, 10, 7, 'Ad Min', '2026-01-01 00:00:00', '2999-01-01 00:00:00');
        CREATE TABLE admin (id INTEGER PRIMARY KEY, name TEXT, email TEXT);
        INSERT INTO admin (id, name, email) VALUES (7, 'Ad Min', 'ad@leemac.test');
    `);
    return db;
}

async function send({ method, path, body }) {
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => { req.user = { id: 7, email: 'ad@leemac.test', role: 'admin', access_level: WRITE_LEVEL, access: WRITE_LEVEL }; next(); });
    app.use('/api/internal/share-links', createShareLinksAdminRouter({ db: seed() }));
    const { baseUrl, close } = await start(app);
    try {
        const res = await fetch(`${baseUrl}/api${path}`, {
            method,
            headers: body ? { 'Content-Type': 'application/json' } : undefined,
            body: body ? JSON.stringify(body) : undefined,
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
