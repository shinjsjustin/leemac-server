const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const routes = fs.readFileSync(path.join(__dirname, '../../src/client/src/routes.js'), 'utf8');

test('/login-admin is wrapped in AdminLoginRoute, not UnprotectedRoute', () => {
    assert.match(routes, /import AdminLoginRoute from '\.\/config\/AdminLoginRoute'/);
    assert.ok(routes.includes('path: "/login-admin", element: <AdminLoginRoute><Login /></AdminLoginRoute>'));
    assert.ok(!routes.includes('<UnprotectedRoute><Login />'));
});

test('other auth pages keep UnprotectedRoute', () => {
    const pages = [
        ['client-login', 'ClientLogin'], ['client-two-factor', 'ClientTwoFactor'], ['two-factor', 'TwoFactor'],
        ['forgot-password', 'ForgotPassword'], ['reset-password', 'ResetPassword'], ['accept-invite', 'AcceptInvite'],
    ];
    for (const [p, c] of pages) {
        assert.ok(routes.includes(`path: "/${p}", element: <UnprotectedRoute><${c} /></UnprotectedRoute>`), p);
    }
});
