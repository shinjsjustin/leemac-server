const { test } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const multer = require('multer');
const { start } = require('../helpers/server');
const { makeFakeDb } = require('../helpers/fakeDb');
const { auditWrites } = require('../../src/lib/bourne/auditLog');

const wait = () => new Promise((r) => setTimeout(r, 50));

async function run(db, { actor, status = 200, send }) {
    const app = express();
    app.use(express.json());
    app.use(multer({ storage: multer.memoryStorage() }).any());
    app.use(auditWrites(db));
    app.use((req, res) => { req.bourneActor = actor; res.status(status).json({ ok: true }); });
    const s = await start(app);
    try {
        const res = await send(s.baseUrl);
        await wait();
        return res;
    } finally { await s.close(); }
}

const postJson = (body) => (url) => fetch(`${url}/x?a=1`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Bourne-Key': 'SECRETKEY' },
    body: JSON.stringify(body),
});

test('inserts one row with method, path, status, ip, actor, accepted', async () => {
    const db = makeFakeDb();
    await run(db, { actor: 'bourne-write', send: postJson({ n: 1 }) });
    assert.strictEqual(db.calls.length, 1);
    assert.match(db.calls[0].sql, /INSERT INTO bourne_write_log/);
    const p = db.calls[0].params;
    assert.ok(p.includes('bourne-write') && p.includes('POST') && p.includes('/x?a=1') && p.includes(200));
    assert.ok(p.includes(1));
    assert.ok(p.some((v) => typeof v === 'string' && v.includes('127.0.0.1')));
    assert.ok(p.includes(JSON.stringify({ n: 1 })));
});

test('accepted is false when actor unset or status 400+', async () => {
    const a = makeFakeDb();
    await run(a, { actor: undefined, send: postJson({}) });
    assert.ok(a.calls[0].params.includes(0));
    const b = makeFakeDb();
    await run(b, { actor: 'bourne-write', status: 400, send: postJson({}) });
    assert.ok(b.calls[0].params.includes(0));
    assert.ok(!b.calls[0].params.includes(1));
});

test('summary never contains key and lists only file metadata', async () => {
    const db = makeFakeDb();
    await run(db, {
        actor: 'bourne-write',
        send: (url) => {
            const fd = new FormData();
            fd.append('note', 'hi');
            fd.append('file', new Blob(['FILEBYTES!'], { type: 'text/plain' }), 'a.txt');
            return fetch(`${url}/up`, { method: 'POST', headers: { 'X-Bourne-Key': 'SECRETKEY' }, body: fd });
        },
    });
    const summary = db.calls[0].params.find((v) => typeof v === 'string' && v.includes('a.txt'));
    assert.ok(summary);
    assert.deepStrictEqual(JSON.parse(summary).files, [{ filename: 'a.txt', mimetype: 'text/plain', size: 10 }]);
    assert.strictEqual(JSON.parse(summary).note, 'hi');
    const all = JSON.stringify(db.calls);
    assert.ok(!all.includes('SECRETKEY'));
    assert.ok(!all.includes('FILEBYTES'));
});

test('summary is truncated to 4000 characters', async () => {
    const db = makeFakeDb();
    await run(db, { actor: 'bourne-write', send: postJson({ big: 'x'.repeat(10000) }) });
    const summary = db.calls[0].params.find((v) => typeof v === 'string' && v.startsWith('{'));
    assert.strictEqual(summary.length, 4000);
});

test('failing insert is logged and response unchanged', async (t) => {
    const err = t.mock.method(console, 'error', () => {});
    const db = { execute: async () => { throw new Error('db down'); } };
    const res = await run(db, { actor: 'bourne-write', status: 201, send: postJson({}) });
    assert.strictEqual(res.status, 201);
    assert.strictEqual(err.mock.callCount(), 1);
});
