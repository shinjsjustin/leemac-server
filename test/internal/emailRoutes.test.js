const { test } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const { start } = require('../helpers/server');
const { makeFakeTxDb } = require('../helpers/fakeTxDb');
const { createEmailRoutes } = require('../../src/routes/emails');

async function call(db, method, path, body) {
    const app = express();
    app.use(express.json());
    app.use('/emails', createEmailRoutes({ db }));
    const server = await start(app);
    try {
        const res = await fetch(`${server.baseUrl}/emails${path}`, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        return { status: res.status, body: await res.json() };
    } finally {
        await server.close();
    }
}

const link = { job_id: 3, message_id: 'm1', subject: 'S', from: 'a@b.c', date: '2026-01-02T03:04:05Z' };
const existing = [
    { match: /FROM job WHERE/, rows: [{ id: 3 }] },
    { match: /SELECT id FROM email_link/, rows: [] },
    { match: /INSERT INTO email_link/, rows: { insertId: 9 } },
];

test('GET lists links for a job', async () => {
    const db = makeFakeTxDb([{ match: /FROM email_link/, rows: [
        { id: 1, message_id: 'm', subject: 's', from_address: 'f', sent_at: 'd', created_by: 'admin' }] }]);
    const res = await call(db, 'GET', '?jobId=3');
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.body, { emails: [{ id: 1, message_id: 'm', subject: 's', from: 'f', date: 'd', created_by: 'admin' }] });
    assert.match(db.calls[0].sql, /job_id = \?/);
    assert.deepStrictEqual(db.calls[0].params, [3]);
});

test('GET lists links for a part', async () => {
    const db = makeFakeTxDb([]);
    const res = await call(db, 'GET', '?partId=7');
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.body, { emails: [] });
    assert.match(db.calls[0].sql, /part_id = \?/);
    assert.deepStrictEqual(db.calls[0].params, [7]);
});

for (const query of ['', '?jobId=1&partId=2', '?jobId=abc', '?jobId=0']) {
    test(`GET ${query || '(no query)'} is 400`, async () => {
        const db = makeFakeTxDb([]);
        const res = await call(db, 'GET', query);
        assert.strictEqual(res.status, 400);
        assert.strictEqual(db.calls.length, 0);
    });
}

test('POST /add creates a link as admin with 201', async () => {
    const db = makeFakeTxDb(existing);
    const res = await call(db, 'POST', '/add', link);
    assert.strictEqual(res.status, 201);
    assert.deepStrictEqual(res.body, { created: 1, existing: 0, ids: [9] });
    const insert = db.calls.find((c) => /INSERT INTO email_link/.test(c.sql || ''));
    assert.strictEqual(insert.params[5], 'admin');
});

test('POST /add with bad input is 400', async () => {
    const res = await call(makeFakeTxDb(existing), 'POST', '/add', { job_id: 3 });
    assert.strictEqual(res.status, 400);
});

test('POST /add with an unknown job is 404', async () => {
    const res = await call(makeFakeTxDb([{ match: /FROM job WHERE/, rows: [] }]), 'POST', '/add', link);
    assert.strictEqual(res.status, 404);
});

test('POST /add with an unexpected failure is 500', async () => {
    const db = makeFakeTxDb([{ match: /FROM job WHERE/, error: new Error('boom') }]);
    const res = await call(db, 'POST', '/add', link);
    assert.strictEqual(res.status, 500);
    assert.deepStrictEqual(res.body, { error: 'Failed to add email link' });
});

test('POST /remove deletes and answers the id', async () => {
    const db = makeFakeTxDb([{ match: /DELETE FROM email_link/, rows: { affectedRows: 1 } }]);
    const res = await call(db, 'POST', '/remove', { id: 4 });
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.body, { id: 4 });
    assert.deepStrictEqual(db.calls[0].params, [4]);
});

test('POST /remove with an unknown id is 404', async () => {
    const db = makeFakeTxDb([{ match: /DELETE FROM email_link/, rows: { affectedRows: 0 } }]);
    const res = await call(db, 'POST', '/remove', { id: 4 });
    assert.strictEqual(res.status, 404);
});

test('POST /remove without a valid id is 400', async () => {
    const db = makeFakeTxDb([]);
    const res = await call(db, 'POST', '/remove', { id: 'x' });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(db.calls.length, 0);
});
