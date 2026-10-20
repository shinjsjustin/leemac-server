const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const read = (rel) => fs.readFileSync(path.join(__dirname, '../../src/client/src', rel), 'utf8');
const auth = (name) => read(`components/Authentication/${name}.js`);

test('routes map the three email-flow pages inside UnprotectedRoute and keep existing paths', () => {
    const routes = read('routes.js');
    for (const [p, c] of [['forgot-password', 'ForgotPassword'], ['reset-password', 'ResetPassword'], ['accept-invite', 'AcceptInvite']]) {
        assert.match(routes, new RegExp(`path: "/${p}", element: <UnprotectedRoute><${c} /></UnprotectedRoute>`));
        assert.match(routes, new RegExp(`import ${c} from './components/Authentication/${c}'`));
    }
    for (const p of ['/', '/login-admin', '/client-login', '/client-register', '/jarvis', '/client-part/:id']) {
        assert.ok(routes.includes(`path: "${p}"`), p);
    }
});

test('ForgotPassword posts to the chosen role forgot-password route and always shows the neutral message', () => {
    const s = auth('ForgotPassword');
    assert.match(s, /apiFetch\(`\/\$\{type\}\/forgot-password`/);
    assert.match(s, /<option value="admin">/);
    assert.match(s, /<option value="client">/);
    assert.match(s, /If that email exists, a link is on its way/);
});

test('ResetPassword reads type and token from the query and posts token and newPassword', () => {
    const s = auth('ResetPassword');
    assert.match(s, /useSearchParams/);
    assert.match(s, /get\('type'\)/);
    assert.match(s, /get\('token'\)/);
    assert.match(s, /apiFetch\(`\/\$\{type\}\/reset-password`/);
    assert.match(s, /body: \{ token, newPassword \}/);
    assert.match(s, /confirm/i);
    assert.match(s, /\/login-admin/);
    assert.match(s, /\/client-login/);
});

test('AcceptInvite posts token and password to /client/accept-invite and stores the session on 201', () => {
    const s = auth('AcceptInvite');
    assert.match(s, /get\('token'\)/);
    assert.match(s, /apiFetch\('\/client\/accept-invite'/);
    assert.match(s, /status === 201/);
    assert.match(s, /localStorage\.setItem\('token', data\.token\)/);
    assert.match(s, /navigate\('\/client-home'\)/);
});

test('ClientRegister is an invite form posting email, name and company_id', () => {
    const s = auth('ClientRegister');
    assert.match(s, /apiFetch\('\/client\/invite'/);
    assert.match(s, /body = \{ email, name, company_id: parseInt\(company_id\) \}/);
    assert.match(s, /Invite sent/);
    assert.doesNotMatch(s, /\/client\/register/);
    assert.doesNotMatch(s, /password/i);
});

test('ClientLogin sends email and password and shows server errors on 401 or 423', () => {
    const s = auth('ClientLogin');
    assert.match(s, /body: \{ email, password \}/);
    assert.doesNotMatch(s, /username/i);
    assert.match(s, /401/);
    assert.match(s, /423/);
    assert.match(s, /data\.error/);
});

test('both login pages link to /forgot-password', () => {
    for (const name of ['ClientLogin', 'Login']) {
        assert.match(auth(name), /<Link to=["']\/forgot-password["']>Forgot password\?<\/Link>/, name);
    }
});

test('ClientUpdateCredentials no longer changes the username but keeps password change', () => {
    const s = auth('ClientUpdateCredentials');
    assert.doesNotMatch(s, /change-username/);
    assert.match(s, /\/client\/change-password/);
});
