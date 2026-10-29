const { test } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const { start } = require('../helpers/server');
const { makeNotesDb } = require('../helpers/notesSqliteDb');

const dbPath = require.resolve('../../src/db/db.js');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {} };

const { createNotesRouter } = require('../../src/routes/notes');

test('GET /getnote returns part_number for a linked note and null otherwise', async () => {
    const db = makeNotesDb();
    db.sqlite.exec(`
        INSERT INTO admin (id, name, email) VALUES (1, 'Zed', 'z@x.com');
        INSERT INTO job (id, company_id, job_number) VALUES (1, 10, 'J-1');
        INSERT INTO part (id, number) VALUES (5, 'P-5');
        INSERT INTO note (id, content, userid, jobid, part_id) VALUES (1, 'with part', 1, 1, 5);
        INSERT INTO note (id, content, userid, jobid) VALUES (2, 'no part', 1, 1);
    `);
    const app = express();
    app.use('/n', createNotesRouter({ db }));
    const server = await start(app);
    try {
        const res = await fetch(`${server.baseUrl}/n/getnote?jobid=1`);
        assert.strictEqual(res.status, 200);
        const byId = Object.fromEntries((await res.json()).map((n) => [n.id, n.part_number]));
        assert.deepStrictEqual(byId, { 1: 'P-5', 2: null });
    } finally {
        await server.close();
    }
});
