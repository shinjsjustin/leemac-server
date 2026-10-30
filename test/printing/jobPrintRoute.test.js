const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const { start } = require('../helpers/server');
const { adminToken, SESSION_HANDLER } = require('../helpers/session');

const PRINTER = { id: 4, name: 'Brother', cups_queue: 'Brother_Q', role: 'letter', media: 'Letter', copies: '{}', enabled: 1 };
let jobs;
let drawings;
let printers;
let inserts;
const db = {
    execute: async (sql, params) => {
        if (/FROM auth_session/.test(sql)) return [SESSION_HANDLER.rows];
        if (/FROM job WHERE id/.test(sql)) return [jobs.filter((j) => j.id === params[0])];
        if (/FROM uploaded_files\s+WHERE job_id/.test(sql)) return [[{ id: 5, filename: 'Quote-1-site.pdf', uploaded_at: 1 }]];
        if (/JOIN job_part/.test(sql)) return [drawings];
        if (/FROM uploaded_files WHERE id/.test(sql)) return [drawings.filter((f) => f.id === params[0])];
        if (/FROM printer WHERE role/.test(sql)) return [printers];
        if (/^INSERT INTO print_job/.test(sql)) {
            inserts.push(params);
            return [{ insertId: 90 + inserts.length }];
        }
        throw new Error(`unexpected sql: ${sql}`);
    },
};
db.query = db.execute;
const dbPath = require.resolve('../../src/db/db.js');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: db };

beforeEach(() => {
    jobs = [{ id: 3, invoice_clicked_at: null }];
    drawings = [
        { id: 11, filename: 'a.pdf', mimetype: 'application/pdf' },
        { id: 12, filename: 'b.pdf', mimetype: 'application/pdf' },
    ];
    printers = [PRINTER];
    inserts = [];
});

const LEVEL_ONE = () => adminToken({ id: 7, email: 'a@x.com', name: 'A', access_level: 1 });

async function call(method, path, body) {
    const server = await start(require('../../src/app'));
    try {
        const res = await fetch(`${server.baseUrl}/api/internal/print/${path}`, {
            method,
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${LEVEL_ONE()}` },
            body: body && JSON.stringify(body),
        });
        return { status: res.status, body: await res.json() };
    } finally {
        await server.close();
    }
}

test('GET job returns the printables for a level-1 admin', async () => {
    const res = await call('GET', 'job?id=3');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.drawings, 2);
    assert.strictEqual(res.body.documents.length, 5);
    assert.strictEqual(res.body.documents[0].file_id, 5);
});

test('GET job refuses a bad id with 400 and an unknown job with 404', async () => {
    assert.strictEqual((await call('GET', 'job')).status, 400);
    assert.strictEqual((await call('GET', 'job?id=abc')).status, 400);
    assert.strictEqual((await call('GET', 'job?id=0')).status, 400);
    assert.strictEqual((await call('GET', 'job?id=99')).status, 404);
});

test('POST job/drawings queues each drawing and records the requester', async () => {
    const res = await call('POST', 'job/drawings', { job_id: 3 });
    assert.strictEqual(res.status, 201);
    assert.deepStrictEqual(res.body, { queued: 2, printer: 'Brother' });
    assert.deepStrictEqual(inserts.map((i) => i[0]), [11, 12]);
    assert.strictEqual(inserts[0][5], 7);
    assert.strictEqual(inserts[0][6], 'a@x.com');
});

test('POST job/drawings refuses a bad job_id with 400', async () => {
    assert.strictEqual((await call('POST', 'job/drawings', {})).status, 400);
    assert.strictEqual((await call('POST', 'job/drawings', { job_id: 'x' })).status, 400);
    assert.deepStrictEqual(inserts, []);
});

test('POST job/drawings maps a missing job to 404 and no printer to 409', async () => {
    assert.strictEqual((await call('POST', 'job/drawings', { job_id: 99 })).status, 404);
    printers = [];
    assert.strictEqual((await call('POST', 'job/drawings', { job_id: 3 })).status, 409);
});
