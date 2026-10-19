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
async function call(handlers, path, body = {}, { key = KEY } = {}) {
    const db = makeFakeTxDb(handlers);
    const app = express();
    app.use(express.json());
    app.use('/w', createBourneWriteRouter({ db, limiter: createWriteLimiter({ max: 1000 }) }));
    const s = await start(app);
    try {
        const headers = { 'Content-Type': 'application/json', ...(key ? { 'X-Bourne-Key': key } : {}) };
        const res = await fetch(`${s.baseUrl}/w${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
        const json = await res.json();
        await wait();
        return { status: res.status, json, calls: db.calls };
    } finally { await s.close(); }
}
const logs = (calls) => calls.filter((c) => /INSERT INTO bourne_write_log/.test(c.sql));
const has = (calls, re) => calls.some((c) => re.test(c.sql));

const JOB = { match: /SELECT id FROM job WHERE id/, rows: [{ id: 3 }] };
const PART = { match: /SELECT id FROM part WHERE id = \?$/, rows: [{ id: 3 }] };
const JOB_PART = { match: /SELECT id FROM job_part WHERE id/, rows: [{ id: 5 }] };
const INVOICE = { match: /SELECT j\.invoice_number/, rows: [{ invoice_number: null }] };
const STAR_JP = { match: /SELECT jp\.id, j\.attention/, rows: [{ id: 5, attention: 'A', company_name: 'Co' }] };

const ROUTES = [
    ['add part', '/jobs/3/parts', { part_id: 3, quantity: 1 }, [JOB, { match: /SELECT id FROM part WHERE id = \?$/, rows: [{ id: 3 }] }, { match: /INSERT INTO job_part/, rows: { insertId: 5 } }], 201, { job_part_id: 5, part_id: 3 }, /INSERT INTO job_part/],
    ['update part', '/jobs/3/parts/5', { quantity: 2 }, [JOB, JOB_PART], 200, null, /UPDATE job_part SET quantity/],
    ['remove part', '/jobs/3/parts/5/remove', {}, [JOB, INVOICE], 200, null, /DELETE FROM job_part/],
    ['star', '/jobs/3/parts/5/star', {}, [JOB, STAR_JP], 201, { starred: true, created: true }, /INSERT INTO stars/],
    ['star existing', '/jobs/3/parts/5/star', {}, [JOB, STAR_JP, { match: /SELECT id FROM stars/, rows: [{ id: 1 }] }], 200, { starred: true, created: false }, /SELECT id FROM stars/],
    ['unstar', '/jobs/3/parts/5/unstar', {}, [JOB, STAR_JP], 200, { starred: false }, /DELETE FROM stars/],
    ['job details', '/jobs/3/details', { attention: 'X' }, [JOB, { match: /UPDATE job SET/, rows: { affectedRows: 1 } }], 200, null, /UPDATE job SET attention/],
    ['note', '/jobs/3/notes', { content: 'hi' }, [JOB, { match: /FROM admin/, rows: [{ id: 9 }] }, { match: /INSERT INTO note/, rows: { insertId: 4 } }], 201, { id: 4 }, /INSERT INTO note/],
    ['part details', '/parts/3/details', { description: 'd' }, [PART], 200, { id: '3' }, /UPDATE part SET description/],
];

for (const [name, path, body, handlers, status, expected, writeSql] of ROUTES) {
    test(`${name} answers ${status} with the lib result and logs once`, async () => {
        const r = await call(handlers, path, body);
        assert.strictEqual(r.status, status);
        if (expected) assert.deepStrictEqual(r.json, expected);
        assert.ok(has(r.calls, writeSql));
        assert.strictEqual(logs(r.calls).length, 1);
    });

    test(`${name} returns 401 for a wrong key and a missing key without writing`, async () => {
        for (const key of ['wrong', null]) {
            const r = await call(handlers, path, body, { key });
            assert.strictEqual(r.status, 401);
            assert.ok(!has(r.calls, writeSql));
            assert.strictEqual(logs(r.calls).length, 1);
        }
    });

    test(`${name} returns 404 for an unknown job or part without writing`, async () => {
        const r = await call([], path, body);
        assert.strictEqual(r.status, 404);
        assert.ok(!has(r.calls, writeSql));
        assert.strictEqual(logs(r.calls).length, 1);
    });
}

test('lib errors keep their status', async () => {
    const r = await call([JOB, JOB_PART], '/jobs/3/parts/5', { quantity: 0 });
    assert.strictEqual(r.status, 400);
    assert.match(r.json.error, /quantity/);
    const gone = await call([JOB], '/jobs/3/parts/5/star', {});
    assert.strictEqual(gone.status, 404);
    const dup = await call([PART, { match: /number = \? AND id <>/, rows: [{ id: 8 }] }], '/parts/3/details', { number: 'A' });
    assert.strictEqual(dup.status, 409);
    const noAuthor = await call([JOB], '/jobs/3/notes', { content: 'hi' });
    assert.strictEqual(noAuthor.status, 503);
});

test('a non-integer jobPartId is a 400 without touching the lib', async () => {
    for (const p of ['', '/remove', '/star', '/unstar']) {
        const r = await call([JOB, JOB_PART, INVOICE, STAR_JP], `/jobs/3/parts/abc${p}`, { quantity: 2 });
        assert.strictEqual(r.status, 400);
        assert.ok(!has(r.calls, /job_part|stars/));
    }
});

test('an unexpected error is a 500 with a short message', async () => {
    const r = await call([JOB, { match: /UPDATE job SET/, error: new Error('boom') }], '/jobs/3/details', { attention: 'X' });
    assert.strictEqual(r.status, 500);
    assert.doesNotMatch(r.json.error, /boom/);
});
