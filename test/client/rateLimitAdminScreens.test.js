const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const auth = (name) => fs.readFileSync(
    path.join(__dirname, '../../src/client/src/components/Authentication', `${name}.js`), 'utf8');

// Screens and how many auth apiFetch calls each must guard.
const SCREENS = [
    ['Login', 1],
    ['TwoFactor', 1],
    ['AdminRegister', 1],
    ['AdminUpdateCredentials', 3],
    ['VerifyEmail', 1],
    ['ForgotPassword', 1],
    ['ResetPassword', 1],
];

// Anything that handles a non-429 outcome.
const OTHER_OUTCOME = /status === (?!429)\d+|Server side error|\.ok\b|Failed to|Passwords do not match/;

for (const [name, calls] of SCREENS) {
    test(`${name} imports tooManyAttemptsMessage from apiFetch`, () => {
        assert.match(auth(name), /import \{[^}]*\btooManyAttemptsMessage\b[^}]*\} from '\.\.\/\.\.\/api\/apiFetch'/);
    });

    test(`${name} handles a 429 response before any other status branch`, () => {
        const s = auth(name);
        const branches = s.match(/status === 429/g) || [];
        assert.strictEqual(branches.length, calls);
        assert.match(s, /tooManyAttemptsMessage\(\w+\)/);
        // Only the code from the first apiFetch call on handles response outcomes.
        const fromCall = s.slice(s.indexOf('await apiFetch('));
        const first429 = fromCall.indexOf('status === 429');
        assert.ok(first429 > -1);
        const firstOther = fromCall.search(OTHER_OUTCOME);
        assert.ok(firstOther === -1 || first429 < firstOther, 'first outcome handled is 429');
    });
}

test('AdminUpdateCredentials guards verify-email, change-email and change-password separately', () => {
    const s = auth('AdminUpdateCredentials');
    for (const [call, okCheck] of [
        ["'/admin/verify-email'", /!response\.ok/],
        ["'/admin/change-email'", /!emailResponse\.ok/],
        ["'/admin/change-password'", /!passwordResponse\.ok/],
    ]) {
        const from = s.slice(s.indexOf(call));
        assert.ok(from.indexOf('status === 429') > -1 && from.indexOf('status === 429') < from.search(okCheck), call);
    }
});

test('ForgotPassword shows the 429 message only on 429 and otherwise the neutral message', () => {
    const s = auth('ForgotPassword');
    assert.match(s, /const response = await apiFetch\(/);
    assert.match(s, /If that email exists, a link is on its way/);
    assert.match(s, /response\.status === 429/);
});
