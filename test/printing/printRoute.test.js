const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const { start } = require('../helpers/server');
const { adminToken, clientToken, SESSION_HANDLER } = require('../helpers/session');

const PRINTER = { id: 4, name: 'Brother', cups_queue: 'Brother_Q', role: 'letter', media: 'Letter', copies: '{"quote":2}', enabled: 1 };
let files;
let printers;
let inserts;
const db = {
    execute: async (sql, params) => {
        if (/FROM auth_session/.test(sql)) return [SESSION_HANDLER.rows];
        if (/FROM uploaded_files WHERE id/.test(sql)) return [files.filter((f) => f.id === params[0])];
        if (/FROM printer WHERE role/.test(sql)) return [printers];
        if (/^INSERT INTO print_job/.test(sql)) {
            inserts.push(params);
            return [{ insertId: 88 }];
        }
        if (/FROM print_job j JOIN printer/.test(sql)) return [[{ printer: PRINTER.name, copies: 2 }]];
        throw new Error(`unexpected sql: ${sql}`);
    },
};
db.query = db.execute;
const dbPath = require.resolve('../../src/db/db.js');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: db };

beforeEach(() => {
    files = [
        { id: 1, filename: 'a.pdf', mimetype: 'application/pdf' },
        { id: 2, filename: 'a.png', mimetype: 'image/png' },
    ];
    printers = [PRINTER];
    inserts = [];
});

async function post(body, token = adminToken({ id: 7, email: 'a@x.com', name: 'A', access_level: 1 })) {
    const server = await start(require('../../src/app'));
    try {
        const res = await fetch(`${server.baseUrl}/api/internal/print`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify(body),
        });
        return { status: res.status, body: await res.json() };
    } finally {
        await server.close();
    }
}

test('queues a PDF for a level-1 admin and records the requester', async () => {
    const res = await post({ file_id: 1, kind: 'quote' });
    assert.strictEqual(res.status, 201);
    assert.deepStrictEqual(res.body, { job_id: 88, printer: 'Brother', copies: 2 });
    assert.strictEqual(inserts[0][0], 1);
    assert.strictEqual(inserts[0][1], 4);
    assert.strictEqual(inserts[0][5], 7);
    assert.ok(inserts[0][6]);
});

test('refuses non-PDF files and unknown kinds with 400', async () => {
    assert.strictEqual((await post({ file_id: 2, kind: 'quote' })).status, 400);
    assert.strictEqual((await post({ file_id: 1, kind: 'poster' })).status, 400);
    assert.strictEqual((await post({ kind: 'quote' })).status, 400);
    assert.strictEqual((await post({ file_id: 'x', kind: 'quote' })).status, 400);
    assert.deepStrictEqual(inserts, []);
});

test('returns 404 for a missing file and 409 when no printer is enabled', async () => {
    assert.strictEqual((await post({ file_id: 99, kind: 'quote' })).status, 404);
    printers = [];
    assert.strictEqual((await post({ file_id: 1, kind: 'quote' })).status, 409);
});

test('refuses level-0 admins and clients', async () => {
    assert.strictEqual((await post({ file_id: 1, kind: 'file' }, adminToken({ id: 7, email: 'a@x.com', access_level: 0 }))).status, 403);
    assert.strictEqual((await post({ file_id: 1, kind: 'file' }, clientToken({ id: 1, username: 'u', name: 'n', company_id: 2 }))).status, 403);
});
