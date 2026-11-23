const { test } = require('node:test');
const assert = require('node:assert');
const { start } = require('../helpers/server');
const { makeShopDb } = require('../helpers/shopSqliteDb');
const { SESSION_HANDLER, adminToken } = require('../helpers/session');

const shop = makeShopDb();
for (const col of ['code', 'address_line1', 'address_line2', 'bill_to_name',
    'bill_to_line1', 'bill_to_line2', 'bill_to_line3', 'bill_to_line4', 'bill_to_line5']) {
    shop.sqlite.exec(`ALTER TABLE company ADD COLUMN ${col} TEXT DEFAULT NULL`);
}
const db = {
    ...shop,
    execute: (sql, params) => (SESSION_HANDLER.match.test(sql) ? [SESSION_HANDLER.rows] : shop.execute(sql, params)),
};
db.query = db.execute;
const dbPath = require.resolve('../../src/db/db.js');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: db };

const BILL_KEYS = ['bill_to_name', 'bill_to_line1', 'bill_to_line2', 'bill_to_line3', 'bill_to_line4', 'bill_to_line5'];
const stored = () => shop.sqlite.prepare('SELECT * FROM company WHERE id = 1').get();

function reset() {
    shop.sqlite.exec(`
        DELETE FROM company;
        INSERT INTO company (id, code, name, address_line1, address_line2, bill_to_name,
            bill_to_line1, bill_to_line2, bill_to_line3, bill_to_line4, bill_to_line5)
        VALUES (1, 'AC', 'Acme', '1 Main', 'Suite 2', 'Acme AP', 'L1', 'L2', 'L3', 'L4', 'L5');
    `);
}

async function withApp(fn, level = 3) {
    reset();
    const server = await start(require('../../src/app'));
    const token = adminToken({ id: 7, email: 'a@x.com', name: 'A', access_level: level });
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
    const put = async (body) => {
        const res = await fetch(`${server.baseUrl}/api/internal/company/editcompany/1`, {
            method: 'PUT', headers, body: JSON.stringify(body),
        });
        return res.status;
    };
    const get = async () => {
        const res = await fetch(`${server.baseUrl}/api/internal/company/getcompanies`, { headers });
        return res.json();
    };
    try { await fn({ put, get }); } finally { await server.close(); }
}

test('PUT of the whole GET row with a changed bill_to_line1 persists it', () => withApp(async ({ put, get }) => {
    const [row] = await get();
    assert.strictEqual(await put({ ...row, bill_to_line1: 'New line' }), 200);
    assert.strictEqual(stored().bill_to_line1, 'New line');
    assert.strictEqual(stored().bill_to_line2, 'L2');
}));

test('PUT without bill-to keys leaves all six bill-to values unchanged', () => withApp(async ({ put }) => {
    assert.strictEqual(await put({ code: 'AX', name: 'Acme 2', address_line1: 'a', address_line2: 'b' }), 200);
    const row = stored();
    assert.deepStrictEqual(BILL_KEYS.map((k) => row[k]), ['Acme AP', 'L1', 'L2', 'L3', 'L4', 'L5']);
    assert.strictEqual(row.name, 'Acme 2');
}));

test('PUT stores null and blank bill-to keys as NULL and trims text', () => withApp(async ({ put }) => {
    const base = { code: 'AC', name: 'Acme', address_line1: 'x', address_line2: 'y' };
    assert.strictEqual(await put({ ...base, bill_to_name: null, bill_to_line1: '   ', bill_to_line2: '  hi  ' }), 200);
    const row = stored();
    assert.strictEqual(row.bill_to_name, null);
    assert.strictEqual(row.bill_to_line1, null);
    assert.strictEqual(row.bill_to_line2, 'hi');
    assert.strictEqual(row.bill_to_line3, 'L3');
}));

test('PUT with a bill-to value over 255 characters or non-string returns 400 and writes nothing', () => withApp(async ({ put }) => {
    const base = { code: 'ZZ', name: 'Changed', address_line1: 'x', address_line2: 'y' };
    assert.strictEqual(await put({ ...base, bill_to_line4: 'a'.repeat(256) }), 400);
    assert.strictEqual(await put({ ...base, bill_to_line5: 5 }), 400);
    assert.strictEqual(stored().name, 'Acme');
    assert.strictEqual(await put({ ...base, bill_to_line4: 'a'.repeat(255) }), 200);
}));

test('level-2 admin gets 403 on editcompany and nothing changes', () => withApp(async ({ put }) => {
    assert.strictEqual(await put({ code: 'ZZ', name: 'Changed', bill_to_line1: 'x' }), 403);
    assert.strictEqual(stored().name, 'Acme');
}, 2));
