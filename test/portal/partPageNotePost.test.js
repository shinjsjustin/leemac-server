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

test('the part page body {part_id, content} is created and listed under the part and its job', async () => {
    const app = express();
    app.use(express.json());
    app.use('/n', createPortalNotesRouter({ db: seed(), writeLimiter: (req, res, next) => next() }));
    const info = mock.method(console, 'info', () => {});
    const server = await start(app);
    try {
        const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${alice}` };
        const created = await fetch(`${server.baseUrl}/n/`, {
            method: 'POST', headers, body: JSON.stringify({ part_id: 1, content: 'Please deburr' }),
        });
        assert.strictEqual(created.status, 201);

        const list = await (await fetch(`${server.baseUrl}/n/`, { headers })).json();
        assert.strictEqual(list.parts[1].length, 1);
        assert.strictEqual(list.parts[1][0].content, 'Please deburr');
        assert.strictEqual(list.parts[1][0].part_id, 1);
        assert.strictEqual(list.jobs[1].length, 1);
        assert.strictEqual(list.jobs[1][0].content, 'Please deburr');
        assert.strictEqual(list.jobs[1][0].part_number, 'P-1');
    } finally {
        await server.close();
        info.mock.restore();
    }
});
