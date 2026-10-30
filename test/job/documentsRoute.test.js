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

beforeEach(() => {
    user = { role: 'admin', access: 3 };
    calls = [];
    makeDocument = async (db, id, type) => {
        calls.push({ db, id, type });
        return { type, fileId: 5, filename: 'Quote-J1-x-site.pdf' };
    };
    latestDocuments = async () => ({ quote: null, order: null, invoice: null, packing: null, shipping: null });
});

async function request(method, path) {
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => { req.user = user; next(); });
    app.use('/', createJobDocumentsRouter({
        db: fakeDb,
        makeDocument: (...a) => makeDocument(...a),
        latestDocuments: (...a) => latestDocuments(...a),
    }));
    const { baseUrl, close } = await start(app);
    try {
        const res = await fetch(baseUrl + path, { method });
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
