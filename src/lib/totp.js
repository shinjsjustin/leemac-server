const INSTALL_MESSAGE = 'TOTP needs npm install otpauth qrcode';
const ISSUER = 'LEEMAC';
const PERIOD_SECONDS = 30;
const DIGITS = 6;
const SECRET_BYTES = 20;
const WINDOW = 1;

// Loaded lazily so the app runs while the optional packages are not installed.
function load(name) {
  try {
    return require(name);
  } catch {
    throw new Error(INSTALL_MESSAGE);
  }
}

function totpFor(OTPAuth, secret, label) {
  return new OTPAuth.TOTP({
    issuer: ISSUER,
    label,
    algorithm: 'SHA1',
    digits: DIGITS,
    period: PERIOD_SECONDS,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
}

/** @returns {string} base32 secret made from 20 random bytes. */
function generateSecret() {
  const OTPAuth = load('otpauth');
  return new OTPAuth.Secret({ size: SECRET_BYTES }).base32;
}

/**
 * @param {string} secret base32 secret
 * @param {string} label account label shown in the authenticator app
 * @returns {string} otpauth:// URI
 */
function keyUri(secret, label) {
  const OTPAuth = load('otpauth');
  return totpFor(OTPAuth, secret, label).toString();
}

/**
 * @param {string} secret base32 secret
 * @param {string} code user-entered code
 * @param {number} [now] epoch milliseconds
 * @returns {number|null} matched time step, or null when the code is wrong or malformed
 */
function verifyCode(secret, code, now = Date.now()) {
  const OTPAuth = load('otpauth');
  let delta = null;
  try {
    delta = totpFor(OTPAuth, secret, 'admin').validate({
      token: String(code),
      timestamp: now,
      window: WINDOW,
    });
  } catch {
    return null;
  }
  if (delta === null) return null;
  return Math.floor(now / (PERIOD_SECONDS * 1000)) + delta;
}

/**
 * @param {string} uri otpauth:// URI
 * @returns {Promise<string>} PNG data URL
 */
function qrDataUrl(uri) {
  return load('qrcode').toDataURL(uri);
}

module.exports = { generateSecret, keyUri, verifyCode, qrDataUrl };
