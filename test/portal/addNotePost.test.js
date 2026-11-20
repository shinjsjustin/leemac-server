const { test, mock } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const { start } = require('../helpers/server');
const { makeNotesDb } = require('../helpers/notesSqliteDb');
const { SESSION_HANDLER, clientToken } = require('../helpers/session');

const sessionDb = { execute: async () => [SESSION_HANDLER.rows], query: async () => [SESSION_HANDLER.rows] };
const dbPath = require.resolve('../../src/db/db.js');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: sessionDb };

const { createPortalNotesRouter } = require('../../src/routes/portalNotes');

const alice = clientToken({ id: 1, username: 'a', name: 'Alice', company_id: 10 });

function seed() {
    const db = makeNotesDb();
    db.sqlite.exec(`
        ALTER TABLE part ADD COLUMN description TEXT;
        ALTER TABLE job_part ADD COLUMN details TEXT;
        INSERT INTO admin (id, name, email) VALUES (9, 'Portal', 'client-portal@leemac.invalid');
        INSERT INTO job (id, company_id) VALUES (1, 10), (2, 20);
        INSERT INTO part (id, number) VALUES (1, 'P-1'), (2, 'P-2');
        INSERT INTO job_part (job_id, part_id) VALUES (1, 1), (2, 2);
    `);
    return db;
}

test('one client posting twice to the same job gets two notes, both 201', async () => {
    const app = express();
    app.use(express.json());
    app.use('/n', createPortalNotesRouter({ db: seed(), writeLimiter: (req, res, next) => next() }));
    const info = mock.method(console, 'info', () => {});
    const server = await start(app);
    const call = (method, body) => fetch(`${server.baseUrl}/n/`, {
        method,
        headers: { Authorization: `Bearer ${alice}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
    });
    try {
        const first = await call('POST', { job_id: 1, content: 'first' });
        const second = await call('POST', { job_id: 1, content: 'second' });
        assert.strictEqual(first.status, 201);
        assert.strictEqual(second.status, 201);

        const { jobs } = await (await call('GET')).json();
        assert.deepStrictEqual(jobs[1].map((n) => n.content).sort(), ['first', 'second']);
    } finally {
        await server.close();
        info.mock.restore();
    }
});
