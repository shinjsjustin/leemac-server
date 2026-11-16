const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('../helpers/server');
const { adminToken } = require('../helpers/session');

const admin = { id: 1, email: 'a@b.c', access_level: 3 };

const fakeDb = {
    execute: async (sql) => {
        if (/FROM auth_session/.test(sql)) return [[{ id: 'f'.repeat(64) }]];
        if (/FROM company WHERE id = \?/.test(sql)) return [[{ id: 3, name: 'Acme' }]];
        if (/FROM company/.test(sql)) return [[{ id: 3, name: 'Acme' }]];
        if (/SELECT \* FROM clients WHERE email = \?/.test(sql)) return [[]];
        return [{ affectedRows: 1, insertId: 1 }];
    },
};
const dbPath = require.resolve('../../src/db/db.js');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: fakeDb };
const mailerPath = require.resolve('../../src/lib/mailer.js');
require.cache[mailerPath] = { id: mailerPath, filename: mailerPath, loaded: true, exports: { sendMail: async () => {} } };

const contracts = require('../../src/client/src/api/contracts/clientInviteApi.json');

let server;
before(async () => {
    server = await start(require('../../src/app'));
});
after(() => server.close());

for (const [name, one] of Object.entries(contracts)) {
    test(`${name} request gets 2xx from the real router`, async () => {
        const res = await fetch(`${server.baseUrl}/api${one.path}`, {
            method: one.method,
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken(admin)}` },
            body: one.body ? JSON.stringify(one.body) : undefined,
        });
        await res.arrayBuffer();
        assert.ok(res.status >= 200 && res.status < 300, `${one.method} ${one.path} answered ${res.status}`);
    });
}
