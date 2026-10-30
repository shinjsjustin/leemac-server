const { test, mock } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const { start } = require('../helpers/server');
const { makeFakeTxDb } = require('../helpers/fakeTxDb');
const { SESSION_HANDLER, adminToken: signAdmin, clientToken: signClient } = require('../helpers/session');

const fakeDb = makeFakeTxDb([SESSION_HANDLER, { match: /./, rows: [] }]);
const dbPath = require.resolve('../../src/db/db.js');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: fakeDb };

const adminToken = (level) => signAdmin({ id: 7, email: 'a@x.com', name: 'A', access_level: level });
const clientToken = signClient({ id: 1, username: 'u', name: 'n', company_id: 2 });

const lib = require('../../src/lib/adminPartLists');
const { createAdminPartListsRouter } = require('../../src/routes/adminPartLists');

async function viaApp(token) {
    const server = await start(require('../../src/app'));
    try {
        const res = await fetch(`${server.baseUrl}/api/internal/part-lists`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        return res.status;
    } finally {
        await server.close();
    }
}

test('part-lists is 403 for a client and a level-1 admin and 200 for level 2', async () => {
    assert.strictEqual(await viaApp(clientToken), 403);
    assert.strictEqual(await viaApp(adminToken(1)), 403);
    assert.strictEqual(await viaApp(adminToken(2)), 200);
});

async function mounted(fn) {
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => { req.user = { id: 7, email: 'a@x.com' }; next(); });
    app.use('/r', createAdminPartListsRouter({ db: fakeDb }));
    const server = await start(app);
    const call = (method, path, body) => fetch(`${server.baseUrl}/r${path}`, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : {},
        body: body ? JSON.stringify(body) : undefined,
    });
    try {
        await fn(call);
    } finally {
        await server.close();
        mock.restoreAll();
    }
}

const USER = { id: 7, email: 'a@x.com' };

test('each route calls its lib function and returns the result', async () => {
    const stub = (name, value) => mock.method(lib, name, async () => value);
    await mounted(async (call) => {
        const list = stub('listLists', [{ id: 3 }]);
        let res = await call('GET', '/');
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.headers.get('cache-control'), 'no-store');
        assert.deepStrictEqual(await res.json(), [{ id: 3 }]);
        assert.strictEqual(list.mock.calls[0].arguments[0], fakeDb);

        const create = stub('createList', { id: 3 });
        res = await call('POST', '/', { name: 'L' });
        assert.strictEqual(res.status, 201);
        assert.deepStrictEqual(await res.json(), { id: 3 });
        assert.deepStrictEqual(create.mock.calls[0].arguments.slice(1), [USER, { name: 'L' }]);

        const rename = stub('renameList', { id: 3, name: 'M' });
        res = await call('PUT', '/3', { name: 'M' });
        assert.deepStrictEqual(await res.json(), { id: 3, name: 'M' });
        assert.deepStrictEqual(rename.mock.calls[0].arguments.slice(1), [USER, 3, { name: 'M' }]);

        const del = stub('deleteList', { ok: true });
        res = await call('DELETE', '/3');
        assert.strictEqual(res.status, 200);
        assert.deepStrictEqual(await res.json(), { ok: true });
        assert.deepStrictEqual(del.mock.calls[0].arguments.slice(1), [USER, 3]);

        const add = stub('addParts', { id: 3, part_ids: [4] });
        res = await call('POST', '/3/parts', { part_ids: [4] });
        assert.deepStrictEqual(await res.json(), { id: 3, part_ids: [4] });
        assert.deepStrictEqual(add.mock.calls[0].arguments.slice(1), [USER, 3, { part_ids: [4] }]);

        const remove = stub('removeParts', { id: 3, part_ids: [] });
        res = await call('POST', '/3/parts/remove', { part_ids: [4] });
        assert.deepStrictEqual(await res.json(), { id: 3, part_ids: [] });
        assert.deepStrictEqual(remove.mock.calls[0].arguments.slice(1), [USER, 3, { part_ids: [4] }]);
    });
});

test('a null result is 404', async () => {
    await mounted(async (call) => {
        for (const [name, method, path] of [
            ['renameList', 'PUT', '/3'], ['deleteList', 'DELETE', '/3'],
            ['addParts', 'POST', '/3/parts'], ['removeParts', 'POST', '/3/parts/remove'],
        ]) {
            mock.method(lib, name, async () => null);
            const res = await call(method, path, { name: 'x' });
            assert.strictEqual(res.status, 404, name);
        }
    });
});

test('AdminPartListError keeps its status and message', async () => {
    await mounted(async (call) => {
        mock.method(lib, 'createList', async () => { throw new lib.AdminPartListError('Too many', 409); });
        const res = await call('POST', '/', { name: 'x' });
        assert.strictEqual(res.status, 409);
        assert.deepStrictEqual(await res.json(), { error: 'Too many' });
    });
});

test('other errors are a generic 500', async () => {
    await mounted(async (call) => {
        mock.method(console, 'error', () => {});
        mock.method(lib, 'listLists', async () => { throw new Error('db exploded: secret'); });
        const res = await call('GET', '/');
        assert.strictEqual(res.status, 500);
        assert.deepStrictEqual(await res.json(), { error: 'Internal Server Error' });
    });
});

test('a non-numeric or malformed id is 404 and never reaches the lib', async () => {
    await mounted(async (call) => {
        const rename = mock.method(lib, 'renameList', async () => ({}));
        for (const path of ['/abc', '/0', '/01', '/12345678901']) {
            const res = await call('PUT', path, { name: 'x' });
            assert.strictEqual(res.status, 404, path);
        }
        assert.strictEqual(rename.mock.calls.length, 0);
    });
});
