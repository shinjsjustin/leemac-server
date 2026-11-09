const { test, mock } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { start } = require('../helpers/server');
const { makeQcDb } = require('../helpers/qcSqliteDb');
const { SESSION_HANDLER, clientToken: signClientToken } = require('../helpers/session');

const sessionDb = { execute: async () => [SESSION_HANDLER.rows], query: async () => [SESSION_HANDLER.rows] };
const dbPath = require.resolve('../../src/db/db.js');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: sessionDb };

const contracts = require('../../src/client/src/api/contracts/qcApi.json');
const { createPortalQcRouter } = require('../../src/routes/portalQc');

const PHOTO_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const alice = signClientToken({ id: 1, username: 'a', name: 'Alice', company_id: 10 });

// Part 1 and photo 1 belong to company 10; marking 2 is Alice's.
function seed() {
    const db = makeQcDb();
    db.sqlite.exec(`
        INSERT INTO job (id, company_id, job_number) VALUES (1, 10, 'J-1');
        INSERT INTO part (id, number) VALUES (1, 'P-1');
        INSERT INTO job_part (job_id, part_id, quantity) VALUES (1, 1, 5);
        INSERT INTO uploaded_files (id, filename, part_id) VALUES (1, 'a.pdf', 1);
        INSERT INTO qc_marking (id, part_id, file_id, page, company_id, kind, x1, y1, size, author_id, author_name, created_at, updated_at)
            VALUES (1, 1, 1, 1, NULL, 'point', 0.1, 0.1, 5, '9', 'Leemac', 'now', 'now'),
                   (2, 1, 1, 1, 10, 'point', 0.2, 0.2, 5, '1', 'Alice', 'now', 'now');
    `);
    db.sqlite.prepare(
        "INSERT INTO qc_photo (id, marking_id, job_id, position, value, mimetype, size, content) VALUES (1, 1, 1, 1, '5.01', 'image/jpeg', ?, ?)"
    ).run(PHOTO_BYTES.length, PHOTO_BYTES);
    return db;
}

async function send({ method, path, body }) {
    const app = express();
    app.use(express.json());
    app.use('/api/portal-qc', createPortalQcRouter({ db: seed(), writeLimiter: (req, res, next) => next() }));
    const info = mock.method(console, 'info', () => {});
    const { baseUrl, close } = await start(app);
    try {
        const res = await fetch(`${baseUrl}${path}`, {
            method,
            headers: {
                Authorization: `Bearer ${alice}`,
                ...(body ? { 'Content-Type': 'application/json' } : {}),
            },
            body: body ? JSON.stringify(body) : undefined,
        });
        return res.status;
    } finally {
        await close();
        info.mock.restore();
    }
}

for (const [name, entry] of Object.entries(contracts)) {
    test(`${name} ${entry.method} ${entry.path} answers 2xx`, async () => {
        const status = await send({ ...entry, path: `/api${entry.path}` });
        assert.ok(status >= 200 && status < 300, `got ${status}`);
    });
}
