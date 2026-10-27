const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const read = (rel) => fs.readFileSync(path.join(__dirname, '../../src/client/src', rel), 'utf8');

test('routes maps /verify-email to VerifyEmail with no wrapper and keeps existing paths', () => {
    const routes = read('routes.js');
    assert.match(routes, /import VerifyEmail from '\.\/components\/Authentication\/VerifyEmail'/);
    assert.match(routes, /path: "\/verify-email", element: <VerifyEmail \/>/);
    assert.match(routes, /\.\.\.clientRoutes/);
    for (const p of ['/', '/login-admin', '/reset-password', '/accept-invite', '/admins/:id']) {
        assert.ok(routes.includes(`path: "${p}"`), p);
    }
});

test('VerifyEmail posts the query token to the confirm route and shows success or the server error', () => {
    const s = read('components/Authentication/VerifyEmail.js');
    assert.match(s, /useSearchParams/);
    assert.match(s, /searchParams\.get\('token'\)/);
    assert.match(s, /apiFetch\('\/admin\/verify-email\/confirm', \{\s*method: 'POST',\s*body: \{ token \}/);
    assert.match(s, /Email verified/);
    assert.match(s, /data\.error/);
});

test('AdminUpdateCredentials announces the verification link and can resend it', () => {
    const s = read('components/Authentication/AdminUpdateCredentials.js');
    assert.match(s, /Check your new email for a verification link/);
    assert.match(s, /apiFetch\('\/admin\/verify-email', \{\s*method: 'POST'/);
    assert.match(s, /Send verification email/);
});

test('AdminsDetails confirms then posts force-logout and reset-2fa for the admin', () => {
    const s = read('components/AdminComponents/AdminsDetails.js');
    assert.match(s, /Force logout/);
    assert.match(s, /Reset 2FA/);
    assert.match(s, /window\.confirm/);
    assert.match(s, /\/internal\/admins\/force-logout/);
    assert.match(s, /\/internal\/admins\/reset-2fa/);
    assert.match(s, /body: \{ userType: 'admin', userId: Number\(id\) \}/);
});
