const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const { start } = require('../helpers/server');
const { makeFakeTxDb } = require('../helpers/fakeTxDb');
const { createWriteLimiter } = require('../../src/middleware/isBourneWrite');
const { createBourneWriteRouter } = require('../../src/routes/bourne/write');

const KEY = 'test-bourne-write-key';
let saved;
beforeEach(() => { saved = process.env.BOURNE_WRITE_KEY; process.env.BOURNE_WRITE_KEY = KEY; });
afterEach(() => {
    if (saved === undefined) delete process.env.BOURNE_WRITE_KEY;
    else process.env.BOURNE_WRITE_KEY = saved;
});

const wait = () => new Promise((r) => setTimeout(r, 50));
async function call(handlers, body, { key = KEY } = {}) {
    const db = makeFakeTxDb(handlers);
    const app = express();
    app.use(express.json());
    app.use('/w', createBourneWriteRouter({ db, limiter: createWriteLimiter({ max: 1000 }) }));
    const s = await start(app);
    try {
        const headers = { 'Content-Type': 'application/json', ...(key ? { 'X-Bourne-Key': key } : {}) };
        const res = await fetch(`${s.baseUrl}/w/emails`, { method: 'POST', headers, body: JSON.stringify(body) });
        const json = await res.json();
        await wait();
        return { status: res.status, json, calls: db.calls };
    } finally { await s.close(); }
}
const logs = (calls) => calls.filter((c) => /INSERT INTO bourne_write_log/.test(c.sql));
const has = (calls, re) => calls.some((c) => re.test(c.sql));

const LINK = { job_id: 3, message_id: '<abc@x>', date: '2026-01-02T03:04:05Z' };
const JOB = { match: /SELECT id FROM job WHERE id IN/, rows: [{ id: 3 }] };
const INSERT = { match: /INSERT INTO email_link/, rows: { insertId: 11 } };

test('links emails, answers 201 and logs once with created_by bourne', async () => {
    const r = await call([JOB, INSERT], { links: [LINK] });
    assert.strictEqual(r.status, 201);
    assert.deepStrictEqual(r.json, { created: 1, existing: 0, ids: [11] });
    const insert = r.calls.find((c) => /INSERT INTO email_link/.test(c.sql));
    assert.strictEqual(insert.params[5], 'bourne');
    assert.strictEqual(logs(r.calls).length, 1);
});

test('reports an already linked email as existing', async () => {
    const r = await call([JOB, { match: /SELECT id FROM email_link/, rows: [{ id: 8 }] }, INSERT], { links: [LINK] });
    assert.strictEqual(r.status, 201);
    assert.deepStrictEqual(r.json, { created: 0, existing: 1, ids: [8] });
    assert.ok(!has(r.calls, /INSERT INTO email_link/));
});

test('returns 400 when links is missing or not an array', async () => {
    for (const body of [{}, { links: 'x' }, { links: {} }]) {
        const r = await call([JOB, INSERT], body);
        assert.strictEqual(r.status, 400);
        assert.ok(!has(r.calls, /INSERT INTO email_link/));
        assert.strictEqual(logs(r.calls).length, 1);
    }
});

test('returns 400 for a bad link', async () => {
    const r = await call([JOB, INSERT], { links: [{ ...LINK, part_id: 4 }] });
    assert.strictEqual(r.status, 400);
    assert.match(r.json.error, /links\[0\]/);
});

test('returns 404 for an unknown job or part', async () => {
    for (const link of [LINK, { part_id: 4, message_id: 'm', date: '2026-01-02' }]) {
        const r = await call([], { links: [link] });
        assert.strictEqual(r.status, 404);
        assert.ok(!has(r.calls, /INSERT INTO email_link/));
    }
});

test('returns 401 for a wrong key and a missing key without writing', async () => {
    for (const key of ['wrong', null]) {
        const r = await call([JOB, INSERT], { links: [LINK] }, { key });
        assert.strictEqual(r.status, 401);
        assert.ok(!has(r.calls, /INSERT INTO email_link/));
        assert.strictEqual(logs(r.calls).length, 1);
    }
});

test('an unexpected error is a 500 with a short message', async () => {
    const r = await call([JOB, { match: /INSERT INTO email_link/, error: new Error('boom') }], { links: [LINK] });
    assert.strictEqual(r.status, 500);
    assert.strictEqual(r.json.error, 'Failed to link emails');
});
