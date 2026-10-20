const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
require('../helpers/server');
const { signPendingToken, verifyPendingToken } = require('../../src/lib/mfaPending');

const source = fs.readFileSync(path.join(__dirname, '../../src/routes/oAuth.js'), 'utf8');

test('google callback no longer issues a session', () => {
    assert.doesNotMatch(source, /issueAdminSession/);
});

test('google callback signs an admin pending token for the user', () => {
    assert.match(source, /signPendingToken\(\s*'admin',\s*req\.user\.id\s*\)/);
});

test('google callback redirects to the two-factor page with an encoded pending token', () => {
    assert.match(source, /\/two-factor\?pending=\$\{encodeURIComponent\(/);
    assert.doesNotMatch(source, /\?token=/);
});

test('pending token for admin 3 round trips', () => {
    assert.deepEqual(verifyPendingToken(signPendingToken('admin', 3)), { userType: 'admin', userId: 3 });
});
