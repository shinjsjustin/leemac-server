const { test } = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('../helpers/server');
const { adminToken, SESSION_HANDLER } = require('../helpers/session');

const PRINTER = { id: 4, name: 'Brother', cups_queue: 'Brother_Q', role: 'letter', media: 'Letter', copies: '{}', enabled: 1 };
const FILE = { id: 60, filename: 'a.pdf', mimetype: 'application/pdf', size: 4, content: Buffer.from('%PDF') };
const db = {
    execute: async (sql, params) => {
        if (/FROM auth_session/.test(sql)) return [SESSION_HANDLER.rows];
        if (/FROM print_agent/.test(sql)) return [[{ created_at: 'c', last_seen_at: null }]];
        if (/FROM printer WHERE id/.test(sql)) return [[PRINTER]];
        if (/^SELECT \* FROM printer/.test(sql)) return [[PRINTER]];
        if (/SELECT p.name AS printer/.test(sql)) return [[{ printer: 'Brother', copies: 1 }]];
        if (/FROM print_job j/.test(sql)) return [[]];
        if (/^INSERT INTO printer/.test(sql)) return [{ insertId: 5 }];
        if (/^INSERT INTO uploaded_files/.test(sql)) return [{ insertId: 61 }];
        if (/FROM uploaded_files WHERE id/.test(sql)) return [[FILE]];
        if (/^INSERT INTO print_job/.test(sql)) return [{ insertId: 70 }];
        if (/^DELETE FROM print_agent|^INSERT INTO print_agent/.test(sql)) return [{ affectedRows: 1 }];
        throw new Error(`unexpected sql: ${sql}`);
    },
};
db.query = db.execute;
const dbPath = require.resolve('../../src/db/db.js');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: db };

const contracts = require('../../src/client/src/api/contracts/printApi.json');

const ADMIN_LEVEL = 3;
const token = adminToken({ id: 7, email: 'a@x.com', name: 'A', access_level: ADMIN_LEVEL });

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
