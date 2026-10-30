const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const { start } = require('../helpers/server');

const dbPath = require.resolve('../../src/db/db.js');
const fakeDb = { execute: async () => [[]] };
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: fakeDb };

const { createJobDocumentsRouter } = require('../../src/routes/job/documents');
const { DocumentError } = require('../../src/lib/jobDocuments');

let user;
let calls;
let makeDocument;
let latestDocuments;
let getDocument;
let refillDocument;
let saveDocument;

beforeEach(() => {
    user = { role: 'admin', access: 3 };
    calls = [];
    makeDocument = async (db, id, type) => {
        calls.push({ db, id, type });
        return { type, fileId: 5, filename: 'Quote-J1-x-site.pdf' };
    };
    latestDocuments = async () => ({ quote: null, order: null, invoice: null, packing: null, shipping: null });
    getDocument = async (db, id, type) => { calls.push({ fn: 'get', id, type }); return { type, saved: false }; };
    refillDocument = async (db, id, type) => { calls.push({ fn: 'refill', id, type }); return { type, saved: false }; };
    saveDocument = async (db, id, type, body, u) => { calls.push({ fn: 'save', id, type, body, u }); return { type, saved: true }; };
});

async function request(method, path, body) {
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => { req.user = user; next(); });
    app.use('/', createJobDocumentsRouter({
        db: fakeDb,
        makeDocument: (...a) => makeDocument(...a),
        latestDocuments: (...a) => latestDocuments(...a),
        getDocument: (...a) => getDocument(...a),
        refillDocument: (...a) => refillDocument(...a),
        saveDocument: (...a) => saveDocument(...a),
    }));
    const { baseUrl, close } = await start(app);
    try {
        const res = await fetch(baseUrl + path, {
            method,
            headers: { 'content-type': 'application/json' },
            body: method === 'GET' ? undefined : JSON.stringify(body),
        });
        return { status: res.status, body: await res.json() };
    } finally {
        await close();
    }
}

test('POST make answers 201 with the document and passes db, id and type', async () => {
    const res = await request('POST', '/documents/make?id=7&type=quote');
    assert.equal(res.status, 201);
    assert.deepEqual(res.body, { type: 'quote', fileId: 5, filename: 'Quote-J1-x-site.pdf' });
    assert.deepEqual(calls, [{ db: fakeDb, id: '7', type: 'quote' }]);
});

for (const [name, u] of [
    ['a client', { role: 'client', company_id: 5 }],
    ['a level 2 admin', { role: 'admin', access: 2 }],
]) {
    test(`POST make returns 403 for ${name} without making`, async () => {
        user = u;
        const res = await request('POST', '/documents/make?id=7&type=quote');
        assert.equal(res.status, 403);
        assert.equal(calls.length, 0);
    });
}

test('POST make returns 400 without id', async () => {
    const res = await request('POST', '/documents/make?type=quote');
    assert.equal(res.status, 400);
    assert.equal(calls.length, 0);
});

for (const status of [400, 404, 503]) {
    test(`POST make maps DocumentError ${status} to the response`, async () => {
        makeDocument = async () => { throw new DocumentError(status, 'nope'); };
        const res = await request('POST', '/documents/make?id=7&type=quote');
        assert.equal(res.status, status);
        assert.deepEqual(res.body, { error: 'nope' });
    });
}

test('POST make returns 500 for unexpected errors', async () => {
    makeDocument = async () => { throw new Error('db down'); };
    const res = await request('POST', '/documents/make?id=7&type=quote');
    assert.equal(res.status, 500);
});

test('GET documents returns latest for a level 1 admin', async () => {
    user = { role: 'admin', access: 1 };
    let seen;
    latestDocuments = async (db, id) => { seen = { db, id }; return { quote: { id: 2 }, order: null, invoice: null, packing: null, shipping: null }; };
    const res = await request('GET', '/documents?id=7');
    assert.equal(res.status, 200);
    assert.equal(res.body.quote.id, 2);
    assert.deepEqual(seen, { db: fakeDb, id: '7' });
});

test('GET documents returns 400 without id', async () => {
    const res = await request('GET', '/documents');
    assert.equal(res.status, 400);
});

test('GET documents returns 403 for a client', async () => {
    user = { role: 'client', company_id: 5 };
    const res = await request('GET', '/documents?id=7');
    assert.equal(res.status, 403);
});

test('GET form, GET refill and PUT save call their functions with id and type', async () => {
    const body = { fields: { a: 1 }, parts: [] };
    assert.deepEqual((await request('GET', '/documents/form?id=7&type=quote')).body, { type: 'quote', saved: false });
    assert.deepEqual((await request('GET', '/documents/refill?id=7&type=order')).body, { type: 'order', saved: false });
    const put = await request('PUT', '/documents/save?id=7&type=invoice', body);
    assert.equal(put.status, 200);
    assert.deepEqual(put.body, { type: 'invoice', saved: true });
    assert.deepEqual(calls, [
        { fn: 'get', id: '7', type: 'quote' },
        { fn: 'refill', id: '7', type: 'order' },
        { fn: 'save', id: '7', type: 'invoice', body, u: user },
    ]);
});

for (const [method, path] of [['GET', '/documents/form'], ['GET', '/documents/refill'], ['PUT', '/documents/save']]) {
    test(`${method} ${path} returns 403 below level 3 and 400 without id`, async () => {
        user = { role: 'admin', access: 2 };
        assert.equal((await request(method, `${path}?id=7&type=quote`, {})).status, 403);
        user = { role: 'admin', access: 3 };
        assert.equal((await request(method, `${path}?type=quote`, {})).status, 400);
        assert.equal(calls.length, 0);
    });

    test(`${method} ${path} maps DocumentError status`, async () => {
        const boom = async () => { throw new DocumentError(409, 'taken'); };
        getDocument = refillDocument = saveDocument = boom;
        const res = await request(method, `${path}?id=7&type=quote`, {});
        assert.equal(res.status, 409);
        assert.deepEqual(res.body, { error: 'taken' });
    });
}

test('PUT save passes an absent body to saveDocument as {}', async () => {
    const res = await request('PUT', '/documents/save?id=7&type=quote');
    assert.equal(res.status, 200);
    assert.deepEqual(calls[0].body, {});
});

test('PUT save answers 400 { error } for a missing or non-array parts with the real saveDocument', async () => {
    const jobDocuments = require('../../src/lib/jobDocuments');
    saveDocument = jobDocuments.saveDocument;
    for (const body of [undefined, { fields: {} }, { parts: [] }, { fields: {}, parts: 'x' }]) {
        const res = await request('PUT', '/documents/save?id=7&type=quote', body);
        assert.equal(res.status, 400);
        assert.equal(typeof res.body.error, 'string');
    }
});
