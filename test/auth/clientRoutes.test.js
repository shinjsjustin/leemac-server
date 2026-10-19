const { test } = require('node:test');
const assert = require('node:assert');
const jwt = require('jsonwebtoken');
const { start } = require('../helpers/server');
const { hashPassword, signAdminToken, signClientToken } = require('../../src/lib/auth');

const CLIENT_ROW = { id: 7, username: 'acme', name: 'Acme', company_id: 3 };
const calls = [];
let takenUsernames = [];
let clientRow;

async function fakeExecute(sql, params) {
    calls.push({ sql, params });
    if (/SELECT \* FROM clients WHERE id = \?/.test(sql)) return [[clientRow]];
    if (/SELECT \* FROM clients WHERE username = \?/.test(sql)) {
        const isKnown = params[0] === CLIENT_ROW.username || takenUsernames.includes(params[0]);
        return [isKnown ? [clientRow] : []];
    }
    if (/INSERT INTO clients/.test(sql)) return [{ insertId: 99 }];
    if (/SELECT \* FROM client;/.test(sql)) return [[{ id: 1 }]];
    return [{}];
}

const dbPath = require.resolve('../../src/db/db.js');
require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: { execute: fakeExecute, query: fakeExecute },
};

const clientToken = () => signClientToken(CLIENT_ROW);
const adminToken = (access) => signAdminToken({ id: 1, email: 'a@b.c', access_level: access });
const sqlCalls = (re) => calls.filter((c) => re.test(c.sql));

async function call(server, method, path, token, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${server.baseUrl}/api/client${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
}

const REGISTER_BODY = { username: 'new', name: 'New', password: 'pw', company_id: 3 };

test('client login signs a client-role token; register and list are admin level 3 only', async () => {
    clientRow = { ...CLIENT_ROW, password: await hashPassword('secret') };
    const server = await start(require('../../src/app'));
    try {
        const login = await call(server, 'POST', '/login', null, { username: 'acme', password: 'secret' });
        assert.strictEqual(login.status, 200);
        const payload = jwt.verify(login.body.token, process.env.JWT_SECRET);
        assert.strictEqual(payload.role, 'client');
        assert.strictEqual(payload.company_id, 3);
        assert.strictEqual(payload.id, 7);

        for (const [token, expected] of [[null, 401], [clientToken(), 403], [adminToken(2), 403]]) {
            const reg = await call(server, 'POST', '/register', token, REGISTER_BODY);
            assert.strictEqual(reg.status, expected);
            const list = await call(server, 'GET', '/', token);
            assert.strictEqual(list.status, expected);
        }
        assert.strictEqual(sqlCalls(/INSERT INTO clients/).length, 0);
        assert.strictEqual(sqlCalls(/FROM client;/).length, 0);

        const reg = await call(server, 'POST', '/register', adminToken(3), REGISTER_BODY);
        assert.strictEqual(reg.status, 201);
        const list = await call(server, 'GET', '/', adminToken(3));
        assert.strictEqual(list.status, 200);
    } finally {
        await server.close();
    }
});

test('change-password and change-username act on the token client and reject other roles', async () => {
    clientRow = { ...CLIENT_ROW, password: await hashPassword('secret') };
    const server = await start(require('../../src/app'));
    try {
        const pwBody = { username: 'victim', currentPassword: 'secret', newPassword: 'fresh' };
        assert.strictEqual((await call(server, 'PUT', '/change-password', null, pwBody)).status, 401);
        assert.strictEqual((await call(server, 'PUT', '/change-password', adminToken(3), pwBody)).status, 403);
        assert.strictEqual(sqlCalls(/UPDATE/).length, 0);

        const pw = await call(server, 'PUT', '/change-password', clientToken(), pwBody);
        assert.strictEqual(pw.status, 200);
        const pwUpdate = sqlCalls(/UPDATE clients SET password/)[0];
        assert.match(pwUpdate.sql, /WHERE id = \?/);
        assert.strictEqual(pwUpdate.params[1], 7);
        assert.ok(!calls.some((c) => c.params && c.params.includes('victim')));

        const unBody = { currentUsername: 'victim', newUsername: 'fresh', password: 'secret' };
        assert.strictEqual((await call(server, 'PUT', '/change-username', null, unBody)).status, 401);
        assert.strictEqual((await call(server, 'PUT', '/change-username', adminToken(3), unBody)).status, 403);

        const un = await call(server, 'PUT', '/change-username', clientToken(), { newUsername: 'fresh', password: 'secret' });
        assert.strictEqual(un.status, 200);
        const unUpdate = sqlCalls(/UPDATE clients SET username/)[0];
        assert.match(unUpdate.sql, /WHERE id = \?/);
        assert.deepStrictEqual(unUpdate.params, ['fresh', 7]);

        takenUsernames = ['taken'];
        const dup = await call(server, 'PUT', '/change-username', clientToken(), { newUsername: 'taken', password: 'secret' });
        assert.strictEqual(dup.status, 409);
        assert.strictEqual(sqlCalls(/UPDATE clients SET username/).length, 1);
    } finally {
        await server.close();
    }
});
