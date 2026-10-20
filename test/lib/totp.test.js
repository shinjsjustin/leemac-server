const test = require('node:test');
const assert = require('node:assert');

let hasOtpauth = true;
try {
  require.resolve('otpauth');
} catch {
  hasOtpauth = false;
}
const skip = !hasOtpauth && 'otpauth is not installed';

test('requiring the module works without the libraries', () => {
  const totp = require('../../src/lib/totp');
  for (const name of ['generateSecret', 'keyUri', 'verifyCode', 'qrDataUrl']) {
    assert.strictEqual(typeof totp[name], 'function');
  }
});

test('generateSecret throws the install message when otpauth is missing', { skip: hasOtpauth && 'otpauth is installed' }, () => {
  const { generateSecret } = require('../../src/lib/totp');
  assert.throws(() => generateSecret(), /npm install otpauth/);
});

test('generateSecret returns a 32-character base32 secret', { skip }, () => {
  const { generateSecret } = require('../../src/lib/totp');
  assert.match(generateSecret(), /^[A-Z2-7]{32}$/);
});

test('keyUri carries issuer LEEMAC, SHA1, 6 digits and 30 second period', { skip }, () => {
  const { generateSecret, keyUri } = require('../../src/lib/totp');
  const uri = keyUri(generateSecret(), 'a@b.com');
  assert.match(uri, /^otpauth:\/\/totp\//);
  assert.match(uri, /issuer=LEEMAC/);
  assert.match(uri, /algorithm=SHA1/);
  assert.match(uri, /digits=6/);
  assert.match(uri, /period=30/);
});

test('verifyCode accepts the current code and returns its step', { skip }, () => {
  const OTPAuth = require('otpauth');
  const { generateSecret, verifyCode } = require('../../src/lib/totp');
  const secret = generateSecret();
  const now = 1700000000000;
  const code = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret), algorithm: 'SHA1', digits: 6, period: 30 }).generate({ timestamp: now });
  assert.strictEqual(verifyCode(secret, code, now), Math.floor(now / 30000));
});

test('verifyCode accepts the previous step within the window', { skip }, () => {
  const OTPAuth = require('otpauth');
  const { generateSecret, verifyCode } = require('../../src/lib/totp');
  const secret = generateSecret();
  const now = 1700000000000;
  const code = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret), algorithm: 'SHA1', digits: 6, period: 30 }).generate({ timestamp: now - 30000 });
  assert.strictEqual(verifyCode(secret, code, now), Math.floor(now / 30000) - 1);
});

test('verifyCode returns null for a wrong code and malformed input', { skip }, () => {
  const { generateSecret, verifyCode } = require('../../src/lib/totp');
  const secret = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
  // RFC 6238 codes for this secret at 1700000000000 are not 000000 in steps -1..+1.
  assert.strictEqual(verifyCode(secret, '000000', 1700000000000), null);
  assert.strictEqual(verifyCode(secret, 'abc'), null);
  assert.strictEqual(verifyCode(secret, undefined), null);
  assert.strictEqual(verifyCode('!!!', '123456'), null);
});
