const { test } = require('node:test');
const assert = require('node:assert');
const { start } = require('../helpers/server');
const { makeFakeDb } = require('../helpers/fakeDb');
const express = require('express');

const KEY = process.env.BOURNE_READ_KEY;

const COMPANY_ROW = { id: 4, name: 'Bloom Co', code: 'BLM', address_line1: '1 Main St', address_line2: null };

function makeDb(total = 120) {
    return makeFakeDb([
        { match: /COUNT\(\*\)/, rows: [{ total }] },
        { match: /FROM company/, rows: [{ ...COMPANY_ROW, password: 'PLANTED_PASSWORD' }] },
    ]);
}

async function get(db, query = '', headers = { 'X-Bourne-Key': KEY }) {
    const { createBourneRouter } = require('../../src/routes/bourne');
    const app = express();
    app.use('/api/bourne', createBourneRouter({ db }));
    const server = await start(app);
    try {
        const res = await fetch(`${server.baseUrl}/api/bourne/companies${query}`, { headers });
        return { status: res.status, body: await res.json() };
    } finally { await server.close(); }
}

const rowsCall = (db) => db.calls.find((c) => !/COUNT\(\*\)/.test(c.sql));
const countCall = (db) => db.calls.find((c) => /COUNT\(\*\)/.test(c.sql));

test('returns companies with exactly the explicit fields, nulls kept, and default paging', async () => {
    const db = makeDb(120);
    const { status, body } = await get(db);
    assert.strictEqual(status, 200);
    assert.deepStrictEqual(body, {
        companies: [COMPANY_ROW],
        pagination: { total: 120, limit: 50, offset: 0, hasMore: true },
    });
    assert.match(rowsCall(db).sql, /ORDER BY c\.name ASC, c\.id ASC/);
    assert.match(rowsCall(db).sql, /LIMIT 50 OFFSET 0/);
    assert.doesNotMatch(rowsCall(db).sql, /\*/);
    assert.doesNotMatch(rowsCall(db).sql, /INSERT|UPDATE|DELETE/i);
});

test('q binds a lower-cased param to LOWER(c.name) LIKE ? in count and page queries', async () => {
    const db = makeDb();
    const { status } = await get(db, '?q=Bloom');
    assert.strictEqual(status, 200);
    for (const call of [rowsCall(db), countCall(db)]) {
        assert.deepStrictEqual(call.params, ['%bloom%']);
        assert.match(call.sql, /WHERE LOWER\(c\.name\) LIKE \?/);
        assert.doesNotMatch(call.sql, /WHERE[^]*c\.code/);
    }
});

test('an injection string in q never appears in SQL', async () => {
    const db = makeDb();
    const evil = "x' OR 1=1 --";
    await get(db, `?q=${encodeURIComponent(evil)}`);
    for (const call of [rowsCall(db), countCall(db)]) {
        assert.doesNotMatch(call.sql, /OR 1=1/);
        assert.deepStrictEqual(call.params, ["%x' or 1=1 --%"]);
    }
});

test('empty or missing q adds no WHERE and no params', async () => {
    for (const query of ['', '?q=']) {
        const db = makeDb();
        await get(db, query);
        for (const call of [rowsCall(db), countCall(db)]) {
            assert.doesNotMatch(call.sql, /WHERE/);
            assert.deepStrictEqual(call.params, []);
        }
    }
});

test('clamps limit into 1..200', async () => {
    const high = await get(makeDb(), '?limit=999');
    assert.strictEqual(high.body.pagination.limit, 200);
    const low = await get(makeDb(), '?limit=0');
    assert.strictEqual(low.body.pagination.limit, 1);
});

for (const query of ['limit=abc', 'limit=1.5', 'offset=-1', 'offset=x']) {
    test(`rejects ${query} with 400 and runs no query`, async () => {
        const db = makeDb();
        const { status, body } = await get(db, `?${query}`);
        assert.strictEqual(status, 400);
        assert.strictEqual(typeof body.error, 'string');
        assert.strictEqual(db.calls.length, 0);
    });
}

test('missing or wrong key returns 401 and runs no query', async () => {
    for (const headers of [{}, { 'X-Bourne-Key': 'wrong' }]) {
        const db = makeDb();
        const { status } = await get(db, '', headers);
        assert.strictEqual(status, 401);
        assert.strictEqual(db.calls.length, 0);
    }
});
