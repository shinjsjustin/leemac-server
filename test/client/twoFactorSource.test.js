const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const read = (rel) => fs.readFileSync(path.join(__dirname, '../../src/client/src', rel), 'utf8');

test('Login stores the pending token as mfaPending, never as token, and goes to /two-factor', () => {
    const s = read('components/Authentication/Login.js');
    assert.match(s, /data\.pendingToken/);
    assert.match(s, /sessionStorage\.setItem\('mfaPending', data\.pendingToken\)/);
    assert.match(s, /navigate\('\/two-factor'\)/);
    assert.doesNotMatch(s, /localStorage\.setItem\('token', data\.pendingToken/);
});

test('routes map /two-factor to TwoFactor inside UnprotectedRoute', () => {
    const s = read('routes.js');
    assert.match(s, /import TwoFactor from '\.\/components\/Authentication\/TwoFactor'/);
    assert.match(s, /path: "\/two-factor", element: <UnprotectedRoute><TwoFactor \/><\/UnprotectedRoute>/);
});

test('TwoFactor reads the pending token from ?pending= or sessionStorage and calls every mfa route', () => {
    const s = read('components/Authentication/TwoFactor.js');
    assert.match(s, /get\('pending'\)/);
    assert.match(s, /sessionStorage\.getItem\('mfaPending'\)/);
    for (const p of ['status', 'email', 'totp/setup', 'totp/enable', 'verify']) {
        assert.ok(s.includes(`'/admin/mfa/${p}'`), p);
    }
    assert.match(s, /pendingToken/);
    assert.match(s, /\/login-admin/);
    assert.match(s, /verify_email/);
    assert.match(s, /setup_totp/);
    assert.match(s, /enter_code/);
});

test('TwoFactor stores only data.token in localStorage and clears mfaPending', () => {
    const s = read('components/Authentication/TwoFactor.js');
    const sets = s.match(/localStorage\.setItem\([^)]*\)/g) || [];
    assert.ok(sets.length > 0);
    for (const c of sets) assert.match(c, /^localStorage\.setItem\('token', [\w.]*token\)$/);
    assert.doesNotMatch(s, /localStorage\.setItem\('token', [\w.]*pending/i);
    assert.match(s, /sessionStorage\.removeItem\('mfaPending'\)/);
    assert.match(s, /navigate\('\/starred-jobs'\)/);
});

test('TwoFactor shows the setup key, the qr image, and backup codes once', () => {
    const s = read('components/Authentication/TwoFactor.js');
    assert.match(s, /<img[^>]*src=\{[\w.]*qr\}/);
    assert.match(s, /[\w.]*secret/);
    assert.match(s, /backupCodes/);
    assert.match(s, /Continue/);
});
