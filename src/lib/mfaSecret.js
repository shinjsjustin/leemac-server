const crypto = require('node:crypto');

const VERSION = 'v1';
const IV_BYTES = 12;

// Read at call time so tests and late-loaded env can set it.
function getKey() {
  const hex = process.env.TOTP_ENCRYPTION_KEY;
  if (!hex || !/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error('TOTP_ENCRYPTION_KEY must be 64 hex characters');
  }
  return Buffer.from(hex, 'hex');
}

/**
 * Encrypt a TOTP secret with AES-256-GCM.
 * @param {string} plain The plaintext secret.
 * @returns {string} `v1:<iv>:<authTag>:<ciphertext>`, each part base64.
 */
function encryptSecret(plain) {
  const key = getKey();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv, tag, ciphertext].map((p) => (Buffer.isBuffer(p) ? p.toString('base64') : p)).join(':');
}

/**
 * Decrypt a value produced by encryptSecret.
 * @param {string} stored The `v1:` formatted string.
 * @returns {string} The plaintext secret.
 * @throws If the key is invalid, the format/version is wrong, or the value was tampered with.
 */
function decryptSecret(stored) {
  const key = getKey();
  const parts = String(stored).split(':');
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error('Unsupported secret format or version');
  }
  const [, iv, tag, ciphertext] = parts.map((p, i) => (i === 0 ? p : Buffer.from(p, 'base64')));
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

module.exports = { encryptSecret, decryptSecret };
