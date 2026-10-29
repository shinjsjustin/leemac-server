const { test, mock } = require('node:test');
const assert = require('node:assert');
const { start } = require('../helpers/server');
const { makeShopDb } = require('../helpers/shopSqliteDb');
const { SESSION_HANDLER, adminToken: signAdminToken, clientToken: signClientToken } = require('../helpers/session');

const db = makeShopDb();
const shopExecute = db.execute;
db.execute = async (sql, params) => (SESSION_HANDLER.match.test(sql) ? [SESSION_HANDLER.rows] : shopExecute(sql, params));
db.query = db.execute;

const dbPath = require.resolve('../../src/db/db.js');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: db };

const COMPANY = 5;
const clientToken = signClientToken({ id: 1, username: 'u', name: 'Pat', company_id: COMPANY });
const adminToken = signAdminToken({ id: 7, email: 'a@x.com', name: 'A', access_level: 3 });

const pad = (n) => String(n).padStart(2, '0');
const localStamp = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
const localDay = (d) => localStamp(d).slice(0, 10);

function seed() {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    db.sqlite.exec(`
        INSERT INTO company (id, name) VALUES (5, 'Mine'), (6, 'Other');
        INSERT INTO part (id, number) VALUES (1, 'P-1');
        INSERT INTO job (id, job_number, company_id, po_date, due_date) VALUES (10, 'M-1', 5, '${localDay(now)}', '${localDay(now)}');
        INSERT INTO job_part (id, job_id, part_id) VALUES (100, 10, 1);
        INSERT INTO stars (job_part_id, status) VALUES (100, 'running_machine_a');
        INSERT INTO job (id, job_number, company_id) VALUES (20, 'A-1', 6);
        INSERT INTO job_part (id, job_id, part_id) VALUES (200, 20, 1);
        INSERT INTO stars (job_part_id, status) VALUES (200, 'qa');
        INSERT INTO star_status_history (job_part_id, job_id, company_id, from_status, to_status, source, changed_at)
            VALUES (200, 20, 6, 'setup', 'qa', 'nfc', '${localStamp(yesterday)}');
    `);
}

async function withServer(fn) {
    const info = mock.method(console, 'info', () => {});
    const server = await start(require('../../src/app'));
    try {
        await fn(server);
    } finally {
        await server.close();
        info.mock.restore();
    }
}

const get = (server, path, token) => fetch(`${server.baseUrl}/api/portal${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
});

test('GET /schedule returns stage {key,label} on timeline and board for a client', async () => {
    seed();
    await withServer(async (server) => {
        const res = await get(server, '/schedule', clientToken);
        assert.strictEqual(res.status, 200);
        const body = await res.json();
        assert.deepStrictEqual(Object.keys(body).sort(), ['board', 'timeline', 'undated', 'window']);
        assert.deepStrictEqual(body.timeline.map((e) => e.stage), [{ key: 'machining', label: 'Machining' }]);
        assert.deepStrictEqual(body.board.map((e) => e.stage), [
            { key: 'machining', label: 'Machining' }, { key: 'inspection', label: 'Inspection' },
        ]);
    });
});

test('GET /ticker returns stage {key,label} for a client', async () => {
    await withServer(async (server) => {
        const res = await get(server, '/ticker', clientToken);
        assert.strictEqual(res.status, 200);
        const body = await res.json();
        assert.strictEqual(body.length, 1);
        assert.deepStrictEqual(body[0].stage, { key: 'inspection', label: 'Inspection' });
        assert.strictEqual(body[0].job_number, 'A-1');
    });
});

test('schedule and ticker are 401 anonymous and 403 for admin', async () => {
    await withServer(async (server) => {
        for (const path of ['/schedule', '/ticker']) {
            assert.strictEqual((await get(server, path)).status, 401, path);
            assert.strictEqual((await get(server, path, adminToken)).status, 403, path);
        }
    });
});
