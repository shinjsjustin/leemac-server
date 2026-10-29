const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('../helpers/server');
const { adminToken } = require('../helpers/session');
const { signPendingToken } = require('../../src/lib/mfaPending');

const ADMIN_ID = 7;
const DEVICE_ROWS = [{ id: 4, label: 'Chrome on macOS', created_at: 'c', last_used_at: 'l', expires_at: 'e' }];
const admin = { id: ADMIN_ID, name: 'Ann', email: 'a@x.com', access_level: 3, disabled: 0, failed_logins: 0, locked_until: null, email_verified_at: new Date(), totp_enabled_at: new Date() };

const fakeDb = {
    execute: async (sql) => {
        if (/FROM auth_session/.test(sql)) return [[{ id: 'f'.repeat(64) }]];
        if (/^SELECT \* FROM admin WHERE id/.test(sql)) return [[admin]];
        if (/^SELECT id, label/.test(sql)) return [DEVICE_ROWS];
        return [{ affectedRows: 1 }];
    },
};
fakeDb.query = fakeDb.execute;
const dbPath = require.resolve('../../src/db/db.js');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: fakeDb };
const mailerPath = require.resolve('../../src/lib/mailer.js');
require.cache[mailerPath] = { id: mailerPath, filename: mailerPath, loaded: true, exports: { sendMail: async () => {} } };

const contracts = require('../../src/client/src/api/contracts/trustedDevices.json');

let server;
before(async () => {
    server = await start(require('../../src/app'));
});
after(() => server.close());

async function send({ method, path, body }) {
    // The fixture's pending token is a placeholder; the real route verifies a signed one.
    const sent = body && body.pendingToken ? { ...body, pendingToken: signPendingToken('admin', ADMIN_ID) } : body;
    const res = await fetch(`${server.baseUrl}/api${path}`, {
        method,
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken(admin)}`,
            'User-Agent': 'Mozilla/5.0 (Macintosh) Safari/605.1',
        },
        body: sent ? JSON.stringify(sent) : undefined,
    });
    await res.arrayBuffer();
    return res.status;
}

for (const [name, entry] of Object.entries(contracts)) {
    [].concat(entry).forEach((one, i) => {
        test(`${name} #${i + 1} request gets 2xx from the real router`, async () => {
            const status = await send(one);
            assert.ok(status >= 200 && status < 300, `${one.method} ${one.path} answered ${status}`);
        });
    });
}
