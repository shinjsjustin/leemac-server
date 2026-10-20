const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const read = (rel) => fs.readFileSync(path.join(__dirname, '../../src/client/src', rel), 'utf8');

test('ClientLogin stores the pending token as clientMfaPending, never as token, and goes to /client-two-factor', () => {
    const s = read('components/Authentication/ClientLogin.js');
    assert.match(s, /data\.pendingToken/);
    assert.match(s, /sessionStorage\.setItem\('clientMfaPending', data\.pendingToken\)/);
    assert.match(s, /navigate\('\/client-two-factor'\)/);
    assert.doesNotMatch(s, /localStorage\.setItem\('token', data\.pendingToken/);
    assert.match(s, /navigate\('\/client-home'\)/);
    assert.match(s, /\/forgot-password/);
});

test('routes map /client-two-factor to ClientTwoFactor inside UnprotectedRoute', () => {
    const s = read('routes.js');
    assert.match(s, /import ClientTwoFactor from '\.\/components\/Authentication\/ClientTwoFactor'/);
    assert.match(s, /path: "\/client-two-factor", element: <UnprotectedRoute><ClientTwoFactor \/><\/UnprotectedRoute>/);
});

test('ClientTwoFactor posts pendingToken and code, keeps only data.token, clears pending, 401 goes to login', () => {
    const s = read('components/Authentication/ClientTwoFactor.js');
    assert.ok(s.includes("'/client/mfa/verify'"));
    assert.match(s, /body: \{ pendingToken, code \}/);
    assert.match(s, /sessionStorage\.getItem\('clientMfaPending'\)/);
    const sets = s.match(/localStorage\.setItem\([^)]*\)/g) || [];
    assert.ok(sets.length > 0);
    for (const c of sets) assert.match(c, /^localStorage\.setItem\('token', data\.token\)$/);
    assert.match(s, /sessionStorage\.removeItem\('clientMfaPending'\)/);
    assert.match(s, /status === 401/);
    assert.match(s, /navigate\('\/client-login'\)/);
    assert.match(s, /navigate\('\/client-home'\)/);
    assert.match(s, /data\.error/);
});

test('ClientTwoFactorSettings calls every mfa route and shows key, qr and backup codes', () => {
    const s = read('components/Authentication/ClientTwoFactorSettings.js');
    for (const p of ['status', 'totp/setup', 'totp/enable', 'totp/disable']) {
        assert.ok(s.includes(`'/client/mfa/${p}'`), p);
    }
    assert.match(s, /<img[^>]*src=\{[\w.]*qr\}/);
    assert.match(s, /[\w.]*secret/);
    assert.match(s, /backupCodes/);
    assert.match(s, /data\.error/);
    assert.match(s, /password/);
});

test('ClientUpdateCredentials renders the settings and still changes the password', () => {
    const s = read('components/Authentication/ClientUpdateCredentials.js');
    assert.match(s, /import ClientTwoFactorSettings from '\.\/ClientTwoFactorSettings'/);
    assert.match(s, /<ClientTwoFactorSettings \/>/);
    assert.ok(s.includes("'/client/change-password'"));
});
