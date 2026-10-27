const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const src = path.join(__dirname, '../../src/client/src');
const read = (p) => fs.readFileSync(path.join(src, p), 'utf8');
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

test('ProtectedRoute decodes in try/catch and calls isAllowed', () => {
    const s = read('config/ProtectedRoute.js');
    assert.match(s, /try\s*\{[\s\S]*jwtDecode\(token\)[\s\S]*\}\s*catch/);
    assert.match(s, /isAllowed\(decoded, \{ role, minLevel: requiredAccessLevel \}\)/);
    assert.match(s, /role = 'admin'/);
});

test('Jarvis guards with isAllowed for admin level 3', () => {
    const s = read('components/Jarvis/Jarvis.js');
    assert.match(s, /isAllowed\(decoded, \{ role: 'admin', minLevel: REQUIRED_ACCESS \}\)/);
    assert.doesNotMatch(s, /decoded\.access < REQUIRED_ACCESS/);
});

test('routes spread clientRoutes and keep a protected admin register', () => {
    const s = read('routes.js');
    assert.match(s, /\.\.\.clientRoutes/);
    assert.match(s, /path: "\/client-update-credentials", element: <ProtectedRoute role="client">/);
    assert.match(s, /path: "\/register-admin", element: <ProtectedRoute requiredAccessLevel=\{3\}><AdminRegister/);
});

test('clientRoutes guards every client page with the client role', () => {
    const s = read('clientRoutes.js');
    for (const p of ['/client-home', '/client-job/:id', '/client-parts', '/client-part/:id']) {
        assert.match(s, new RegExp(`path: '${p}', element: <ProtectedRoute role="client">`));
    }
});

test('Navbar has no client add job and uses token role', () => {
    const s = read('components/Navbar.js');
    assert.doesNotMatch(s, /handleClientAddJob/);
    assert.match(s, /isAdmin = decodedToken\?\.role === 'admin'/);
    assert.match(s, /isClient = decodedToken\?\.role === 'client'/);
});
