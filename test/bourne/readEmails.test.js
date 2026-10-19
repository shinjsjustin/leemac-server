const { test } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const { start } = require('../helpers/server');
const { makeFakeDb } = require('../helpers/fakeDb');

const KEY = process.env.BOURNE_READ_KEY;

const ROW = { id: 2, message_id: 'abc@x', subject: 'Hi', from_address: 'a@b.c', sent_at: '2026-01-02 03:04:05', created_by: 'bourne' };
const EMAIL = { id: 2, message_id: 'abc@x', subject: 'Hi', from: 'a@b.c', date: '2026-01-02 03:04:05', created_by: 'bourne' };

function fakeDb({ job = true, part = true } = {}) {
    return makeFakeDb([
        { match: /SELECT id FROM job WHERE id = \?/, rows: job ? [{ id: 3 }] : [] },
        { match: /SELECT id FROM part WHERE id = \?/, rows: part ? [{ id: 3 }] : [] },
        { match: /FROM email_link/, rows: [ROW] },
    ]);
}

async function get(db, path, key = KEY) {
    const { createBourneRouter } = require('../../src/routes/bourne');
    const app = express();
    app.use('/api/bourne', createBourneRouter({ db }));
    const server = await start(app);
    try {
        const res = await fetch(`${server.baseUrl}/api/bourne${path}`, { headers: key ? { 'X-Bourne-Key': key } : {} });
        return { status: res.status, body: await res.json() };
    } finally { await server.close(); }
}

for (const [kind, table, column] of [['jobs', 'job', 'job_id'], ['parts', 'part', 'part_id']]) {
    test(`GET /${kind}/:id/emails answers 200 with the linked emails`, async () => {
        const db = fakeDb();
        const { status, body } = await get(db, `/${kind}/3/emails`);
        assert.strictEqual(status, 200);
        assert.deepStrictEqual(body, { emails: [EMAIL] });
        const list = db.calls.find((c) => /FROM email_link/.test(c.sql));
        assert.match(list.sql, new RegExp(`${column} = \\?`));
        assert.deepStrictEqual(list.params, [3]);
    });

    test(`GET /${kind}/:id/emails answers 404 for an unknown ${table}`, async () => {
        const db = fakeDb({ job: false, part: false });
        const { status, body } = await get(db, `/${kind}/3/emails`);
        assert.strictEqual(status, 404);
        assert.ok(body.error);
        assert.ok(!db.calls.some((c) => /FROM email_link/.test(c.sql)));
    });

    test(`GET /${kind}/:id/emails answers 400 for a non-integer id without querying`, async () => {
        const db = fakeDb();
        const { status } = await get(db, `/${kind}/abc/emails`);
        assert.strictEqual(status, 400);
        assert.strictEqual(db.calls.length, 0);
    });

    test(`GET /${kind}/:id/emails answers 401 without the read key`, async () => {
        const { status } = await get(fakeDb(), `/${kind}/3/emails`, null);
        assert.strictEqual(status, 401);
    });
}
