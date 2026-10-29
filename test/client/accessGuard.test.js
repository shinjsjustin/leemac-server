const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const src = path.join(__dirname, '../../src/client/src');
const NOW = 1_000_000_000_000;
const FUTURE = NOW / 1000 + 3600;
const PAST = NOW / 1000 - 1;

let isAllowed;
test.before(async () => {
    ({ isAllowed } = await import(pathToFileURL(path.join(src, 'config/access.js')).href));
});

const ADMIN2 = { role: 'admin', access: 2, exp: FUTURE };
const CLIENT = { role: 'client', company_id: 5, exp: FUTURE };
const cases = [
    ['null', null, {}, false],
    ['undefined', undefined, {}, false],
    ['role-less object', { access: 3, exp: FUTURE }, {}, false],
    ['expired token', { ...ADMIN2, exp: PAST }, {}, false],
    ['token expiring exactly now', { ...ADMIN2, exp: NOW / 1000 }, {}, false],
    ['admin under the level', ADMIN2, { minLevel: 3 }, false],
    ['admin with non-integer access', { ...ADMIN2, access: '3' }, {}, false],
    ['admin at the level', ADMIN2, { minLevel: 2 }, true],
    ['admin at default level', ADMIN2, undefined, true],
    ['client on admin route', CLIENT, {}, false],
    ['admin on client route', ADMIN2, { role: 'client' }, false],
    ['client on client route', CLIENT, { role: 'client' }, true],
    ['client with zero company_id', { ...CLIENT, company_id: 0 }, { role: 'client' }, false],
    ['client with missing company_id', { role: 'client', exp: FUTURE }, { role: 'client' }, false],
];
for (const [name, decoded, opts, want] of cases) {
    test(`isAllowed is ${want} for ${name}`, () => {
        assert.strictEqual(isAllowed(decoded, opts, NOW), want);
    });
}
