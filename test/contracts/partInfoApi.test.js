const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('../helpers/server');
const { makeShopDb } = require('../helpers/shopSqliteDb');
const { SESSION_HANDLER, adminToken: signAdminToken } = require('../helpers/session');

const db = makeShopDb();
const shopExecute = db.execute;
db.execute = async (sql, params) => (SESSION_HANDLER.match.test(sql) ? [SESSION_HANDLER.rows] : shopExecute(sql, params));
db.query = db.execute;

const dbPath = require.resolve('../../src/db/db.js');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: db };

const contracts = require('../../src/client/src/api/contracts/partInfoApi.json');

const ADMIN_LEVEL = 3;
const token = signAdminToken({ id: 7, email: 'a@x.com', name: 'A', access_level: ADMIN_LEVEL });

beforeEach(() => {
    db.sqlite.exec(`
        DELETE FROM note; DELETE FROM part; DELETE FROM admin;
        INSERT INTO admin (id, name, email) VALUES (7, 'A', 'a@x.com');
        INSERT INTO part (id, number) VALUES (5, 'P-5');
        INSERT INTO note (id, content, userid, part_id) VALUES (1, 'part note', 7, 5);
    `);
});

for (const [name, { method, path, body }] of Object.entries(contracts)) {
    test(`${name} ${method} ${path} answers 2xx`, async () => {
        const server = await start(require('../../src/app'));
        try {
            const res = await fetch(`${server.baseUrl}/api${path}`, {
                method,
                headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
                body: body ? JSON.stringify(body) : undefined,
            });
            assert.ok(res.status >= 200 && res.status < 300, `got ${res.status}`);
        } finally {
            await server.close();
        }
    });
}
