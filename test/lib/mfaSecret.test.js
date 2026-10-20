const test = require('node:test');
const assert = require('node:assert');
const { encryptSecret, decryptSecret } = require('../../src/lib/mfaSecret');

const KEY = 'ab'.repeat(32);
const SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';

function withKey(value, fn) {
  const saved = process.env.TOTP_ENCRYPTION_KEY;
  if (value === undefined) delete process.env.TOTP_ENCRYPTION_KEY;
  else process.env.TOTP_ENCRYPTION_KEY = value;
  try {
    return fn();
  } finally {
    if (saved === undefined) delete process.env.TOTP_ENCRYPTION_KEY;
    else process.env.TOTP_ENCRYPTION_KEY = saved;
  }
}

test('round trips a 32-character base32 secret', () => {
  withKey(KEY, () => {
    const stored = encryptSecret(SECRET);
    assert.ok(stored.startsWith('v1:'));
    assert.strictEqual(decryptSecret(stored), SECRET);
  });
});

test('two encryptions of the same input differ', () => {
  withKey(KEY, () => {
    assert.notStrictEqual(encryptSecret(SECRET), encryptSecret(SECRET));
  });
});

test('output fits in 255 characters', () => {
  withKey(KEY, () => {
    assert.ok(encryptSecret(SECRET).length <= 255);
  });
});

test('uses a 12-byte iv', () => {
  withKey(KEY, () => {
    const iv = Buffer.from(encryptSecret(SECRET).split(':')[1], 'base64');
    assert.strictEqual(iv.length, 12);
  });
});

for (const [name, key] of [
  ['missing', undefined],
  ['short', 'ab'.repeat(31)],
  ['non-hex', 'zz'.repeat(32)],
]) {
  test(`throws when key is ${name}`, () => {
    withKey(key, () => {
      assert.throws(() => encryptSecret(SECRET), /TOTP_ENCRYPTION_KEY/);
      assert.throws(() => decryptSecret('v1:a:b:c'), /TOTP_ENCRYPTION_KEY/);
    });
  });
}

test('throws on a flipped ciphertext character', () => {
  withKey(KEY, () => {
    const parts = encryptSecret(SECRET).split(':');
    const ct = Buffer.from(parts[3], 'base64');
    ct[0] ^= 1;
    parts[3] = ct.toString('base64');
    assert.throws(() => decryptSecret(parts.join(':')));
  });
});

test('throws on a wrong prefix', () => {
  withKey(KEY, () => {
    const stored = encryptSecret(SECRET).replace('v1:', 'v2:');
    assert.throws(() => decryptSecret(stored), /version|format/i);
  });
});
