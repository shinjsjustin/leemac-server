const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const { start } = require('../helpers/server');
const { adminToken, SESSION_HANDLER } = require('../helpers/session');

const PRINTER = { id: 4, name: 'Brother', cups_queue: 'Brother_Q', role: 'letter', media: 'Letter', copies: '{}', enabled: 1 };
let calls;
const db = {
    execute: async (sql, params) => {
        calls.push({ sql, params });
        if (/FROM auth_session/.test(sql)) return [SESSION_HANDLER.rows];
        if (/FROM print_agent/.test(sql)) return [[{ created_at: 'c', last_seen_at: '2026-01-01' }]];
        if (/FROM printer WHERE id/.test(sql)) return [params[0] === 4 ? [PRINTER] : []];
        if (/^SELECT \* FROM printer/.test(sql)) return [[PRINTER]];
        if (/SELECT p.name AS printer/.test(sql)) return [[{ printer: 'Brother', copies: 1 }]];
        if (/FROM print_job j/.test(sql)) return [[{ id: 1, status: 'printed' }]];
        if (/^INSERT INTO printer/.test(sql)) return [{ insertId: 5 }];
        if (/^UPDATE printer/.test(sql)) return [{ affectedRows: params[params.length - 1] === 4 ? 1 : 0 }];
        if (/^INSERT INTO uploaded_files/.test(sql)) return [{ insertId: 60 }];
        if (/FROM uploaded_files WHERE id/.test(sql)) return [[{ id: 60, filename: 'test-print.pdf', mimetype: 'application/pdf' }]];
        if (/^INSERT INTO print_job/.test(sql)) return [{ insertId: 70 }];
        if (/^DELETE FROM print_agent|^INSERT INTO print_agent/.test(sql)) return [{ affectedRows: 1 }];
        throw new Error(`unexpected sql: ${sql}`);
    },
};
db.query = db.execute;
const dbPath = require.resolve('../../src/db/db.js');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: db };

beforeEach(() => { calls = []; });

const token = (level) => adminToken({ id: 7, email: 'a@x.com', name: 'A', access_level: level });

async function call(method, path, level, body) {
    const server = await start(require('../../src/app'));
    try {
        const res = await fetch(`${server.baseUrl}/api/internal${path}`, {
            method,
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token(level)}` },
            body: body && JSON.stringify(body),
        });
        return { status: res.status, body: await res.json() };
    } finally {
        await server.close();
    }
}

const NEW_PRINTER = { name: 'Zebra', cups_queue: 'Zebra_Q', role: 'label', media: '4x6', copies: { shipping: 1 } };

test('lists printers, agent last seen and recent jobs for level 1', async () => {
    const res = await call('GET', '/printers', 1);
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.body, {
        printers: [PRINTER],
        agent: { last_seen_at: '2026-01-01' },
        jobs: [{ id: 1, status: 'printed' }],
    });
    assert.ok(calls.some((c) => /LIMIT 20$/.test(c.sql)));
});

test('creating and editing printers needs level 3', async () => {
    assert.strictEqual((await call('POST', '/printers', 2, NEW_PRINTER)).status, 403);
    assert.strictEqual((await call('PUT', '/printers/4', 2, { name: 'X' })).status, 403);
    const created = await call('POST', '/printers', 3, NEW_PRINTER);
    assert.strictEqual(created.status, 201);
    assert.deepStrictEqual(created.body, { id: 5 });
    assert.strictEqual((await call('PUT', '/printers/4', 3, { name: 'X' })).status, 200);
});

test('invalid printer input is 400 and an unknown printer is 404', async () => {
    assert.strictEqual((await call('POST', '/printers', 3, { name: 'Zebra' })).status, 400);
    assert.strictEqual((await call('PUT', '/printers/4', 3, { role: 'fax' })).status, 400);
    assert.strictEqual((await call('PUT', '/printers/9', 3, { name: 'X' })).status, 404);
});

test('agent token needs level 3, is returned once and is stored only as a hash', async () => {
    assert.strictEqual((await call('POST', '/printers/agent-token', 2)).status, 403);
    const res = await call('POST', '/printers/agent-token', 3);
    assert.strictEqual(res.status, 201);
    assert.match(res.body.token, /^[0-9a-f]{64}$/);
    const insert = calls.find((c) => /^INSERT INTO print_agent/.test(c.sql));
    assert.notStrictEqual(insert.params[0], res.body.token);
    const list = await call('GET', '/printers', 1);
    assert.ok(!JSON.stringify(list.body).includes(res.body.token));
});

test('test print stores a PDF with no job or part and queues it to that printer', async () => {
    const res = await call('POST', '/printers/4/test', 1);
    assert.strictEqual(res.status, 201);
    assert.deepStrictEqual(res.body, { job_id: 70, printer: 'Brother', copies: 1 });
    const upload = calls.find((c) => /^INSERT INTO uploaded_files/.test(c.sql));
    assert.ok(!/part_id|job_id/.test(upload.sql));
    assert.ok(Buffer.isBuffer(upload.params[3]) && upload.params[3].subarray(0, 5).toString() === '%PDF-');
    const job = calls.find((c) => /^INSERT INTO print_job/.test(c.sql));
    assert.deepStrictEqual([job.params[0], job.params[1], job.params[2]], [60, 4, 'file']);
});

test('test print for an unknown printer is 404', async () => {
    assert.strictEqual((await call('POST', '/printers/9/test', 1)).status, 404);
});
