const { test } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
require('../helpers/server');
const { signPendingToken, verifyPendingToken, nextAdminStep } = require('../../src/lib/mfaPending');

test('round trips userType and userId', () => {
    assert.deepEqual(verifyPendingToken(signPendingToken('admin', 7)), { userType: 'admin', userId: 7 });
    assert.deepEqual(verifyPendingToken(signPendingToken('client', 3)), { userType: 'client', userId: 3 });
});

test('pending token has purpose mfa, no sid and a 10 minute expiry', () => {
    const d = jwt.decode(signPendingToken('admin', 7));
    assert.equal(d.purpose, 'mfa');
    assert.equal('sid' in d, false);
    assert.equal(d.exp - d.iat, 600);
});

test('null for an expired token', () => {
    const t = jwt.sign({ purpose: 'mfa', userType: 'admin', userId: 7 }, process.env.JWT_SECRET, { expiresIn: -10 });
    assert.equal(verifyPendingToken(t), null);
});

test('null for a wrong purpose, a session token, an unknown userType and garbage', () => {
    const sign = (p) => jwt.sign(p, process.env.JWT_SECRET);
    assert.equal(verifyPendingToken(sign({ purpose: 'reset', userType: 'admin', userId: 7 })), null);
    assert.equal(verifyPendingToken(sign({ role: 'admin', id: 7, sid: 'abc' })), null);
    assert.equal(verifyPendingToken(sign({ purpose: 'mfa', userType: 'root', userId: 7 })), null);
    assert.equal(verifyPendingToken(jwt.sign({ purpose: 'mfa', userType: 'admin', userId: 7 }, 'wrong')), null);
    assert.equal(verifyPendingToken('garbage'), null);
    assert.equal(verifyPendingToken(undefined), null);
});

test('nextAdminStep picks the first unfinished step', () => {
    assert.equal(nextAdminStep({ email_verified_at: null, totp_enabled_at: null }), 'verify_email');
    assert.equal(nextAdminStep({ email_verified_at: null, totp_enabled_at: new Date() }), 'verify_email');
    assert.equal(nextAdminStep({ email_verified_at: new Date(), totp_enabled_at: null }), 'setup_totp');
    assert.equal(nextAdminStep({ email_verified_at: new Date(), totp_enabled_at: new Date() }), 'enter_code');
});
