const { test } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const { start } = require('../helpers/server');
const { makeShopDb } = require('../helpers/shopSqliteDb');

const db = makeShopDb();
const dbPath = require.resolve('../../src/db/db.js');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: db };

const starsRouter = require('../../src/routes/job/stars');

function reset() {
    db.sqlite.exec(`
        DELETE FROM star_status_history; DELETE FROM stars; DELETE FROM job_part; DELETE FROM part; DELETE FROM job; DELETE FROM company;
        INSERT INTO company (id, name) VALUES (10, 'Acme');
        INSERT INTO job (id, company_id, job_number) VALUES (3, 10, 'J-1');
        INSERT INTO part (id, number) VALUES (5, 'P-5');
        INSERT INTO job_part (id, job_id, part_id) VALUES (7, 3, 5), (8, 3, 5);
        INSERT INTO stars (id, job_part_id, status) VALUES (4, 7, 'open'), (5, 8, 'open');
    `);
}
const starredIds = () => db.sqlite.prepare('SELECT job_part_id FROM stars ORDER BY job_part_id').all().map((r) => r.job_part_id);

test('DELETE unstarjob with the client body removes only that part star', async () => {
    reset();
    const app = express();
    app.use(express.json());
    app.use('/j', starsRouter);
    const server = await start(app);
    try {
        const res = await fetch(`${server.baseUrl}/j/unstarjob`, {
            method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jobPartId: 7 }),
        });
        assert.strictEqual(res.status, 200);
        assert.deepStrictEqual(await res.json(), { message: 'Job part unstarred successfully' });
        assert.deepStrictEqual(starredIds(), [8]);
    } finally { await server.close(); }
});
