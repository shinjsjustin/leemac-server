const { test } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const { start } = require('../helpers/server');

const calls = [];
let handler;
const db = { execute: async (sql, params) => { calls.push({ sql, params }); return handler(sql, params); } };
const dbPath = require.resolve('../../src/db/db.js');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: db };
const crud = require('../../src/routes/job/crud');
const invoicing = require('../../src/routes/job/invoicing');

const DUP = { code: 'ER_DUP_ENTRY', message: "Duplicate entry '7' for key 'job.uq_job_invoice_number'" };
const writes = () => calls.filter((c) => /^\s*(UPDATE|REPLACE|INSERT)/i.test(c.sql));

async function withApp(h, fn) {
    calls.length = 0;
    handler = h;
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => { req.user = { role: 'admin', access: 3 }; next(); });
    app.use('/j', crud);
    app.use('/j', invoicing);
    const server = await start(app);
    const post = async (path, body) => {
        const res = await fetch(`${server.baseUrl}/j${path}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        });
        return { status: res.status, body: await res.json() };
    };
    const origErr = console.error; console.error = () => {};
    try { await fn(post); } finally { console.error = origErr; await server.close(); }
}

test('updatedetails answers 409 naming the other job and runs no UPDATE', () =>
    withApp(async (sql) => (/SELECT job_number/.test(sql) ? [[{ job_number: 'J-9' }]] : [{ affectedRows: 1 }]), async (post) => {
        assert.deepStrictEqual(await post('/updatedetails', { jobId: 3, invoiceNumber: ' 7 ' }),
            { status: 409, body: { error: 'Invoice number 7 is already used by job J-9' } });
        assert.deepStrictEqual(writes(), []);
    }));

test('updatedetails saves the trimmed invoice number when free', () =>
    withApp(async (sql) => (/SELECT job_number/.test(sql) ? [[]] : [{ affectedRows: 1 }]), async (post) => {
        assert.strictEqual((await post('/updatedetails', { jobId: 3, invoiceNumber: ' 7 ' })).status, 200);
        assert.deepStrictEqual(calls[0].params, ['7', 3]);
        assert.deepStrictEqual(writes()[0].params, ['7', 3]);
    }));

test('updatedetails skips the owner check for a blank invoice number', () =>
    withApp(async () => [{ affectedRows: 1 }], async (post) => {
        assert.strictEqual((await post('/updatedetails', { jobId: 3, invoiceNumber: '' })).status, 200);
        assert.strictEqual(calls.length, 1);
        assert.deepStrictEqual(calls[0].params, [null, 3]);
    }));

test('updatedetails maps a racing ER_DUP_ENTRY to 409', () =>
    withApp(async (sql) => {
        if (/SELECT job_number/.test(sql)) return [[]];
        throw DUP;
    }, async (post) => {
        const res = await post('/updatedetails', { jobId: 3, invoiceNumber: '7' });
        assert.strictEqual(res.status, 409);
        assert.match(res.body.error, /Invoice number 7 is already used/);
    }));

function invoiceHandler({ failUpdate } = {}) {
    return async (sql) => {
        if (/FROM job WHERE id/.test(sql)) return [[{ invoice_number: null }]];
        if (/MAX\(/.test(sql)) return [[{ max_number: 41 }]];
        if (/^\s*UPDATE job SET invoice_number/.test(sql) && failUpdate) throw DUP;
        if (/current_financial_period_id/.test(sql)) return [[]];
        return [{ affectedRows: 1 }];
    };
}

test('updateinvoiceandincrement assigns the next number and records it in metadata', () =>
    withApp(invoiceHandler(), async (post) => {
        assert.strictEqual((await post('/updateinvoiceandincrement', { jobId: 3 })).status, 200);
        const upd = calls.find((c) => /^\s*UPDATE job SET invoice_number/.test(c.sql));
        assert.strictEqual(upd.params[0], '42');
        assert.strictEqual(upd.params[3], 3);
        const meta = calls.find((c) => /REPLACE INTO metadata/.test(c.sql));
        assert.deepStrictEqual(meta.params, ['42']);
    }));

test('updateinvoiceandincrement answers 409 on a duplicate and writes no metadata', () =>
    withApp(invoiceHandler({ failUpdate: true }), async (post) => {
        const res = await post('/updateinvoiceandincrement', { jobId: 3 });
        assert.strictEqual(res.status, 409);
        assert.ok(res.body.error);
        assert.strictEqual(calls.some((c) => /REPLACE INTO metadata/.test(c.sql)), false);
    }));

function reclickHandler() {
    return async (sql) => {
        if (/FROM job WHERE id/.test(sql)) return [[{ invoice_number: '17' }]];
        if (/current_financial_period_id/.test(sql)) return [[{ metavalue: '5' }]];
        if (/FROM job_period/.test(sql)) return [[]];
        return [{ affectedRows: 1 }];
    };
}

test('updateinvoiceandincrement on a numbered job keeps the number, writes no metadata, still assigns the period', () =>
    withApp(reclickHandler(), async (post) => {
        assert.strictEqual((await post('/updateinvoiceandincrement', { jobId: 3 })).status, 200);
        assert.strictEqual(calls.some((c) => /MAX\(/.test(c.sql)), false);
        assert.strictEqual(calls.some((c) => /REPLACE INTO metadata/.test(c.sql)), false);
        assert.strictEqual(calls.some((c) => /invoice_number =/.test(c.sql)), false);
        assert.ok(calls.some((c) => /SET invoice_clicked_at/.test(c.sql)));
        const ins = calls.find((c) => /INSERT INTO job_period/.test(c.sql));
        assert.deepStrictEqual(ins.params, [3, 5]);
    }));

test('updateinvoiceandincrement answers 400 without a jobId', () =>
    withApp(reclickHandler(), async (post) => {
        assert.strictEqual((await post('/updateinvoiceandincrement', {})).status, 400);
        assert.strictEqual(calls.length, 0);
    }));

test('updateinvoiceandincrement answers 404 for an unknown job', () =>
    withApp(async () => [[]], async (post) => {
        assert.strictEqual((await post('/updateinvoiceandincrement', { jobId: 99 })).status, 404);
    }));
