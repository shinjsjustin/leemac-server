const { test, mock } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { start } = require('../helpers/server');
const { makeNotesDb } = require('../helpers/notesSqliteDb');
const { SESSION_HANDLER, clientToken: signClientToken } = require('../helpers/session');

const sessionDb = { execute: async () => [SESSION_HANDLER.rows], query: async () => [SESSION_HANDLER.rows] };
const dbPath = require.resolve('../../src/db/db.js');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: sessionDb };

const contracts = require('../../src/client/src/api/contracts/portalNotesApi.json');
const { createPortalNotesRouter } = require('../../src/routes/portalNotes');

const alice = signClientToken({ id: 1, username: 'a', name: 'Alice', company_id: 10 });

function seed() {
    const db = makeNotesDb();
    db.sqlite.exec(`
        INSERT INTO admin (id, name, email) VALUES (9, 'Portal', 'client-portal@leemac.invalid');
        INSERT INTO job (id, company_id) VALUES (1, 10);
        INSERT INTO part (id, number) VALUES (1, 'P-1');
        INSERT INTO job_part (job_id, part_id) VALUES (1, 1);
    `);
    return db;
}

async function send({ method, path, body }) {
    const app = express();
    app.use(express.json());
    app.use('/portal-notes', createPortalNotesRouter({ db: seed(), writeLimiter: (req, res, next) => next() }));
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

for (const [name, value] of Object.entries(contracts)) {
    for (const entry of [].concat(value)) {
        test(`${name} ${entry.method} ${entry.path} ${JSON.stringify(entry.body)} answers 2xx`, async () => {
            const status = await send(entry);
            assert.ok(status >= 200 && status < 300, `got ${status}`);
        });
    }
}
