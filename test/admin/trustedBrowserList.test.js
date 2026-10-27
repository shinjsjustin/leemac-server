const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { start } = require('../helpers/server');
const { adminToken } = require('../helpers/session');

let deleteAffected;
const calls = [];
const DEVICE_ROWS = [{ id: 4, label: 'Chrome on macOS', created_at: 'c', last_used_at: 'l', expires_at: 'e' }];
const fakeDb = {
    execute: async (sql, params) => {
        calls.push({ sql, params });
        if (/FROM auth_session/.test(sql)) return [[{ id: 'f'.repeat(64) }]];
        if (/^SELECT id, label/.test(sql)) return [DEVICE_ROWS];
        if (/^DELETE FROM admin_trusted_device WHERE id/.test(sql)) return [{ affectedRows: deleteAffected }];
        return [{ affectedRows: 1 }];
    },
};
fakeDb.query = fakeDb.execute;
const dbPath = require.resolve('../../src/db/db.js');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: fakeDb };
const mailerPath = require.resolve('../../src/lib/mailer.js');
require.cache[mailerPath] = { id: mailerPath, filename: mailerPath, loaded: true, exports: { sendMail: async () => {} } };

let server;
before(async () => {
    server = await start(require('../../src/app'));
});
after(() => server.close());

const deviceCalls = () => calls.filter((c) => /admin_trusted_device/.test(c.sql));
const reset = (affected = 1) => {
    calls.length = 0;
    deleteAffected = affected;
};
const call = async (method, path, level, body) => {
    const res = await fetch(`${server.baseUrl}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken({ id: 7, access_level: level })}` },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
};

test('GET /trusted-devices lists only the caller rows without token_hash', async () => {
    reset();
    const r = await call('GET', '/api/admin/trusted-devices', 0);
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(r.body, { devices: DEVICE_ROWS });
    const select = calls.find((c) => /^SELECT id, label/.test(c.sql));
    assert.deepStrictEqual(select.params, [7]);
    assert.ok(!/token_hash/.test(select.sql));
});

test('DELETE /trusted-devices/:id removes the callers own device', async () => {
    reset();
    const r = await call('DELETE', '/api/admin/trusted-devices/4', 0);
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(calls.find((c) => /^DELETE FROM admin_trusted_device WHERE id/.test(c.sql)).params, [4, 7]);
});

test('DELETE /trusted-devices/:id answers 404 when not the callers', async () => {
    reset(0);
    assert.strictEqual((await call('DELETE', '/api/admin/trusted-devices/4', 0)).status, 404);
});

test('DELETE /trusted-devices removes all of the callers devices', async () => {
    reset();
    const r = await call('DELETE', '/api/admin/trusted-devices', 0);
    assert.strictEqual(r.status, 200);
    const del = deviceCalls().find((c) => /^DELETE FROM admin_trusted_device WHERE admin_id = \?$/.test(c.sql));
    assert.deepStrictEqual(del.params, [7]);
});

for (const id of ['abc', '0', '-1', '1.5']) {
    test(`DELETE /trusted-devices/${id} answers 400 without touching devices`, async () => {
        reset();
        assert.strictEqual((await call('DELETE', `/api/admin/trusted-devices/${id}`, 0)).status, 400);
        assert.strictEqual(deviceCalls().length, 0);
    });
}

test('GET internal trusted-devices lists any admin at level 3', async () => {
    reset();
    const r = await call('GET', '/api/internal/admins/trusted-devices/9', 3);
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(r.body, { devices: DEVICE_ROWS });
    assert.deepStrictEqual(calls.find((c) => /^SELECT id, label/.test(c.sql)).params, [9]);
});

test('internal trusted-device routes answer 403 below level 3', async () => {
    reset();
    assert.strictEqual((await call('GET', '/api/internal/admins/trusted-devices/9', 2)).status, 403);
    assert.strictEqual((await call('POST', '/api/internal/admins/revoke-trusted-devices', 2, { adminId: 9 })).status, 403);
    assert.strictEqual(deviceCalls().length, 0);
});

test('POST revoke-trusted-devices revokes one device for the admin', async () => {
    reset();
    const r = await call('POST', '/api/internal/admins/revoke-trusted-devices', 3, { adminId: 9, deviceId: 4 });
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(calls.find((c) => /^DELETE FROM admin_trusted_device WHERE id/.test(c.sql)).params, [4, 9]);
});

test('POST revoke-trusted-devices answers 404 when the device is not found', async () => {
    reset(0);
    assert.strictEqual((await call('POST', '/api/internal/admins/revoke-trusted-devices', 3, { adminId: 9, deviceId: 4 })).status, 404);
});

test('POST revoke-trusted-devices without deviceId revokes all for the admin', async () => {
    reset();
    const r = await call('POST', '/api/internal/admins/revoke-trusted-devices', 3, { adminId: 9 });
    assert.strictEqual(r.status, 200);
    const del = deviceCalls().find((c) => /^DELETE FROM admin_trusted_device WHERE admin_id = \?$/.test(c.sql));
    assert.deepStrictEqual(del.params, [9]);
});

const BAD = [
    ['POST', '/api/internal/admins/revoke-trusted-devices', { adminId: 'x' }],
    ['POST', '/api/internal/admins/revoke-trusted-devices', {}],
    ['POST', '/api/internal/admins/revoke-trusted-devices', { adminId: 0 }],
    ['POST', '/api/internal/admins/revoke-trusted-devices', { adminId: 9, deviceId: 'x' }],
    ['POST', '/api/internal/admins/revoke-trusted-devices', { adminId: 9, deviceId: -2 }],
    ['GET', '/api/internal/admins/trusted-devices/abc', undefined],
];
for (const [method, path, body] of BAD) {
    test(`${method} ${path} ${JSON.stringify(body)} answers 400 without touching devices`, async () => {
        reset();
        assert.strictEqual((await call(method, path, 3, body)).status, 400);
        assert.strictEqual(deviceCalls().length, 0);
    });
}
