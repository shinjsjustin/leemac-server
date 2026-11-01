const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const { start } = require('../helpers/server');
const { makeFakeTxDb } = require('../helpers/fakeTxDb');
const { createWriteLimiter } = require('../../src/middleware/isBourneWrite');
const { createBourneWriteRouter } = require('../../src/routes/bourne/write');

const KEY = 'test-bourne-write-key';
const MAX_BYTES = 20 * 1024 * 1024;
let saved;
beforeEach(() => { saved = process.env.BOURNE_WRITE_KEY; process.env.BOURNE_WRITE_KEY = KEY; });
afterEach(() => {
    if (saved === undefined) delete process.env.BOURNE_WRITE_KEY;
    else process.env.BOURNE_WRITE_KEY = saved;
});

const wait = () => new Promise((r) => setTimeout(r, 50));
async function call(handlers, body, { key = KEY, json = false } = {}) {
    const db = makeFakeTxDb(handlers);
    const app = express();
    app.use(express.json());
    app.use('/w', createBourneWriteRouter({ db, limiter: createWriteLimiter({ max: 1000 }) }));
    const s = await start(app);
    try {
        const headers = key ? { 'X-Bourne-Key': key } : {};
        if (json) headers['Content-Type'] = 'application/json';
        const res = await fetch(`${s.baseUrl}/w/expenses`, {
            method: 'POST', headers, body: json ? JSON.stringify(body) : body,
        });
        const out = await res.json();
        await wait();
        return { status: res.status, json: out, calls: db.calls };
    } finally { await s.close(); }
}
const logs = (calls) => calls.filter((c) => /INSERT INTO bourne_write_log/.test(c.sql));
const expenses = (calls) => calls.filter((c) => /INSERT INTO expense \(/.test(c.sql));
const uploads = (calls) => calls.filter((c) => /INSERT INTO uploaded_files/.test(c.sql));

const VENDORS = { match: /FROM expense WHERE vendor IS NOT NULL/, rows: [{ vendor: 'Acme Steel', expenses: 2, last_used: '2026-01-01' }] };
const JOB = { match: /SELECT id FROM job WHERE id/, rows: [{ id: 3 }] };
const FILE_INSERT = { match: /INSERT INTO uploaded_files/, rows: { insertId: 11 } };
const EXPENSE_INSERT = { match: /INSERT INTO expense \(/, rows: { insertId: 21 } };
const PERIOD = { match: /FROM financial_period/, rows: [{ id: 4 }] };
const HANDLERS = [VENDORS, JOB, FILE_INSERT, EXPENSE_INSERT, PERIOD];

const FIELDS = {
    vendor: 'Acme Steel', amount: '12.50', expense_date: '2026-03-02', description: 'Bar stock',
    job_id: '3', category: 'Materials', notes: 'approved', new_vendor: 'true',
};
function form({ fields = FIELDS, invoice } = {}) {
    const f = new FormData();
    for (const [k, v] of Object.entries(fields)) f.append(k, v);
    if (invoice) f.append('invoice', new File([Buffer.alloc(invoice.size ?? 4, 'a')], invoice.name, { type: 'application/pdf' }));
    return f;
}

test('multipart post with an invoice pdf answers 201 with the lib result', async () => {
    const r = await call(HANDLERS, form({ invoice: { name: 'inv.pdf' } }));
    assert.strictEqual(r.status, 201);
    assert.deepStrictEqual(r.json, { id: 21, vendor: 'Acme Steel', vendor_created: false, job_id: 3, period_id: 4, file_id: 11 });
    assert.strictEqual(uploads(r.calls).length, 1);
    assert.strictEqual(logs(r.calls).length, 1);
});

test('json post without a file answers 201', async () => {
    const r = await call(HANDLERS, { ...FIELDS, job_id: 3, new_vendor: true }, { json: true });
    assert.strictEqual(r.status, 201);
    assert.strictEqual(r.json.file_id, null);
    assert.strictEqual(uploads(r.calls).length, 0);
    assert.strictEqual(expenses(r.calls).length, 1);
});

test('unknown vendor answers 400 with suggestions', async () => {
    const r = await call(HANDLERS, { ...FIELDS, vendor: 'Acme Steal', new_vendor: undefined }, { json: true });
    assert.strictEqual(r.status, 400);
    assert.deepStrictEqual(r.json, { error: 'Unknown vendor', suggestions: ['Acme Steel'] });
    assert.strictEqual(expenses(r.calls).length, 0);
});

test('duplicate expense answers 409', async () => {
    const dup = { match: /WHERE amount = \? AND expense_date = \?/, rows: [{ id: 9, vendor: 'acme steel' }] };
    const r = await call([dup, ...HANDLERS], FIELDS, { json: true });
    assert.strictEqual(r.status, 409);
    assert.deepStrictEqual(r.json, { error: 'Duplicate expense', existing_id: 9 });
    assert.strictEqual(expenses(r.calls).length, 0);
});

test('wrong or missing key answers 401 without inserting an expense', async () => {
    for (const key of ['wrong', null]) {
        const r = await call(HANDLERS, form({ invoice: { name: 'inv.pdf' } }), { key });
        assert.strictEqual(r.status, 401);
        assert.strictEqual(expenses(r.calls).length, 0);
        assert.strictEqual(logs(r.calls).length, 1);
    }
});

test('file over 20 MB answers 413 without inserting', async () => {
    const r = await call(HANDLERS, form({ invoice: { name: 'inv.pdf', size: MAX_BYTES + 1 } }));
    assert.strictEqual(r.status, 413);
    assert.strictEqual(expenses(r.calls).length, 0);
    assert.strictEqual(logs(r.calls).length, 1);
});

test('database failure answers 500', async () => {
    const r = await call([VENDORS, JOB, { match: /INSERT INTO expense \(/, error: new Error('boom') }], FIELDS, { json: true });
    assert.strictEqual(r.status, 500);
    assert.deepStrictEqual(r.json, { error: 'Failed to record expense' });
});
