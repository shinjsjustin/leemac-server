const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const { start } = require('../helpers/server');
const { makeFakeTxDb } = require('../helpers/fakeTxDb');
const { createWriteLimiter } = require('../../src/middleware/isBourneWrite');
const { createBourneWriteRouter } = require('../../src/routes/bourne/write');

const KEY = 'test-bourne-write-key';
const wait = () => new Promise((r) => setTimeout(r, 50));
let saved;
beforeEach(() => { saved = process.env.BOURNE_WRITE_KEY; process.env.BOURNE_WRITE_KEY = KEY; });
afterEach(() => {
    if (saved === undefined) delete process.env.BOURNE_WRITE_KEY;
    else process.env.BOURNE_WRITE_KEY = saved;
});

const QUOTE_HANDLERS = [
    { match: /SELECT metavalue FROM metadata/, rows: [{ metavalue: '"41"' }] },
    { match: /INSERT INTO job \(/, rows: { insertId: 7 } },
    { match: /INSERT IGNORE INTO part/, rows: { insertId: 9, affectedRows: 1 } },
    { match: /INSERT INTO job_part/, rows: { insertId: 55 } },
];
const JOB_EXISTS = { match: /SELECT id FROM job WHERE id/, rows: [{ id: 3 }] };
const FILE_INSERT = { match: /INSERT INTO uploaded_files/, rows: { insertId: 11 } };

async function call(handlers, path, init = {}, { limiter, key = KEY } = {}) {
    const db = makeFakeTxDb(handlers);
    const app = express();
    app.use(express.json());
    app.use('/w', createBourneWriteRouter({ db, limiter }));
    const s = await start(app);
    try {
        const headers = { ...(key ? { 'X-Bourne-Key': key } : {}), ...(init.headers || {}) };
        const res = await fetch(`${s.baseUrl}/w${path}`, { method: 'POST', ...init, headers });
        const json = await res.json();
        await wait();
        return { status: res.status, json, calls: db.calls };
    } finally { await s.close(); }
}

const json = (body) => ({ body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
const form = (name, size = 3) => {
    const f = new FormData();
    f.append('files', new Blob([Buffer.alloc(size, 1)]), name);
    return { body: f };
};
const logs = (calls) => calls.filter((c) => /INSERT INTO bourne_write_log/.test(c.sql));
const uploads = (calls) => calls.filter((c) => /INSERT INTO uploaded_files/.test(c.sql));
const validPo = { po_number: 'PO1', po_date: '2026-01-02', due_date: null, tax_code: 1, tax: 2, tax_percent: 0 };

test('quote returns 201 with the created job', async () => {
    const r = await call(QUOTE_HANDLERS, '/jobs/quote', json({ company_id: 1, parts: [{ part_number: 'A', quantity: 2 }] }));
    assert.strictEqual(r.status, 201);
    assert.deepStrictEqual(r.json, { id: 7, job_number: '42', job_part_ids: [55] });
});

test('quote returns the QuoteJobError status', async () => {
    const r = await call(QUOTE_HANDLERS, '/jobs/quote', json({ parts: [] }));
    assert.strictEqual(r.status, 400);
    assert.match(r.json.error, /company_id/);
});

test('quote returns 500 for an unexpected error', async () => {
    const r = await call([{ match: /SELECT metavalue/, error: new Error('boom') }], '/jobs/quote',
        json({ company_id: 1, parts: [{ part_number: 'A', quantity: 1 }] }));
    assert.strictEqual(r.status, 500);
});

test('files returns 201 with ids for an allowed file', async () => {
    const r = await call([JOB_EXISTS, FILE_INSERT], '/jobs/3/files', form('a.pdf'));
    assert.strictEqual(r.status, 201);
    assert.deepStrictEqual(r.json, { ids: [11] });
    assert.strictEqual(uploads(r.calls).length, 1);
    assert.strictEqual(uploads(r.calls)[0].params[4], '3');
});

test('files returns 413 over 20 MB without inserting', async () => {
    const r = await call([JOB_EXISTS, FILE_INSERT], '/jobs/3/files', form('a.pdf', 20 * 1024 * 1024 + 1));
    assert.strictEqual(r.status, 413);
    assert.strictEqual(uploads(r.calls).length, 0);
});

test('files returns 400 for a disallowed type without inserting', async () => {
    const r = await call([JOB_EXISTS, FILE_INSERT], '/jobs/3/files', form('a.exe'));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(uploads(r.calls).length, 0);
});

test('files returns 400 when no files are sent', async () => {
    const r = await call([JOB_EXISTS, FILE_INSERT], '/jobs/3/files', { body: new FormData() });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(uploads(r.calls).length, 0);
});

test('files returns 404 for an unknown job without inserting', async () => {
    const r = await call([FILE_INSERT], '/jobs/9/files', form('a.pdf'));
    assert.strictEqual(r.status, 404);
    assert.strictEqual(uploads(r.calls).length, 0);
});

test('po updates only the sent fields and returns the job id', async () => {
    const r = await call([JOB_EXISTS], '/jobs/3/po', json(validPo));
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(r.json, { id: '3' });
    const upd = r.calls.find((c) => /UPDATE job SET/.test(c.sql));
    assert.strictEqual(upd.sql, 'UPDATE job SET po_number = ?, po_date = ?, due_date = ?, tax_code = ?, tax = ?, tax_percent = ? WHERE id = ?');
    assert.deepStrictEqual(upd.params, ['PO1', '2026-01-02', null, 1, 2, 0, '3']);
});

test('po with only due_date updates just that column', async () => {
    const r = await call([JOB_EXISTS], '/jobs/3/po', json({ due_date: '2026-02-01' }));
    assert.strictEqual(r.status, 200);
    const upd = r.calls.find((c) => /UPDATE job SET/.test(c.sql));
    assert.strictEqual(upd.sql, 'UPDATE job SET due_date = ? WHERE id = ?');
    assert.deepStrictEqual(upd.params, ['2026-02-01', '3']);
});

test('po stores a trimmed po_number', async () => {
    const r = await call([JOB_EXISTS], '/jobs/3/po', json({ po_number: '  PO7  ' }));
    assert.strictEqual(r.status, 200);
    const upd = r.calls.find((c) => /UPDATE job SET/.test(c.sql));
    assert.deepStrictEqual(upd.params, ['PO7', '3']);
});

test('po returns 400 when no PO fields are sent', async () => {
    const r = await call([JOB_EXISTS], '/jobs/3/po', json({ bogus: 1 }));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.calls.filter((c) => /UPDATE job/.test(c.sql)).length, 0);
});

test('po returns 400 on invalid fields without updating', async () => {
    const r = await call([JOB_EXISTS], '/jobs/3/po', json({ ...validPo, tax_code: 5 }));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.calls.filter((c) => /UPDATE job/.test(c.sql)).length, 0);
});

test('po returns 404 for an unknown job', async () => {
    const r = await call([], '/jobs/9/po', json(validPo));
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.calls.filter((c) => /UPDATE job/.test(c.sql)).length, 0);
});

test('every call is logged once, including 401, 404 and 429', async () => {
    const ok = await call([JOB_EXISTS], '/jobs/3/po', json(validPo));
    const bad = await call([], '/jobs/3/po', json(validPo), { key: 'wrong' });
    const missing = await call([], '/nope', json({}));
    for (const r of [ok, bad, missing]) assert.strictEqual(logs(r.calls).length, 1);
    assert.strictEqual(bad.status, 401);
    assert.strictEqual(missing.status, 404);

    const db = makeFakeTxDb([JOB_EXISTS]);
    const app = express();
    app.use(express.json());
    app.use('/w', createBourneWriteRouter({ db, limiter: createWriteLimiter({ max: 2 }) }));
    const s = await start(app);
    try {
        const statuses = [];
        for (let i = 0; i < 3; i++) {
            const res = await fetch(`${s.baseUrl}/w/jobs/3/po`, { method: 'POST', ...json(validPo), headers: { ...json(validPo).headers, 'X-Bourne-Key': KEY } });
            statuses.push(res.status);
        }
        await wait();
        assert.deepStrictEqual(statuses, [200, 200, 429]);
        assert.strictEqual(logs(db.calls).length, 3);
    } finally { await s.close(); }
});

test('non-POST methods return 405 and are logged', async () => {
    const r = await call([], '/jobs/3/po', { method: 'GET' });
    assert.strictEqual(r.status, 405);
    assert.strictEqual(logs(r.calls).length, 1);
});

const PART_EXISTS = { match: /SELECT id FROM part WHERE id/, rows: [{ id: 3 }] };
const multiForm = (names, size = 3) => {
    const f = new FormData();
    for (const n of names) f.append('files', new Blob([Buffer.alloc(size, 1)]), n);
    return { body: f };
};

test('part files returns 201 with both ids and inserts with the part id', async () => {
    let id = 20;
    const insert = { match: /INSERT INTO uploaded_files/, rows: () => ({ insertId: id++ }) };
    const r = await call([PART_EXISTS, insert], '/parts/3/files', multiForm(['a.pdf', 'b.step']));
    assert.strictEqual(r.status, 201);
    assert.strictEqual(r.json.ids.length, 2);
    assert.strictEqual(uploads(r.calls).length, 2);
    for (const u of uploads(r.calls)) {
        assert.match(u.sql, /part_id/);
        assert.strictEqual(u.params[u.params.length - 1], '3');
    }
    assert.strictEqual(logs(r.calls).length, 1);
});

test('part files returns 404 for an unknown part without inserting', async () => {
    const r = await call([FILE_INSERT], '/parts/9/files', form('a.pdf'));
    assert.strictEqual(r.status, 404);
    assert.strictEqual(uploads(r.calls).length, 0);
    assert.strictEqual(logs(r.calls).length, 1);
});

const REJECTS = [
    ['over 20 MB', () => form('a.pdf', 20 * 1024 * 1024 + 1), 413],
    ['a disallowed type', () => form('a.exe'), 400],
    ['11 files', () => multiForm(Array.from({ length: 11 }, (_, i) => `f${i}.pdf`)), 400],
    ['no files', () => ({ body: new FormData() }), 400],
];
for (const [name, make, status] of REJECTS) {
    test(`part files returns ${status} for ${name} without inserting`, async () => {
        const r = await call([PART_EXISTS, FILE_INSERT], '/parts/3/files', make());
        assert.strictEqual(r.status, status);
        assert.strictEqual(uploads(r.calls).length, 0);
        assert.strictEqual(logs(r.calls).length, 1);
    });
}

for (const [name, key] of [['a wrong key', 'wrong'], ['a missing key', null]]) {
    test(`part files returns 401 for ${name} without inserting`, async () => {
        const r = await call([PART_EXISTS, FILE_INSERT], '/parts/3/files', form('a.pdf'), { key });
        assert.strictEqual(r.status, 401);
        assert.strictEqual(uploads(r.calls).length, 0);
        assert.strictEqual(logs(r.calls).length, 1);
    });
}
