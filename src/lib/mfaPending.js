const jwt = require('jsonwebtoken');
const { signToken } = require('./auth');

const PENDING_PURPOSE = 'mfa';
const PENDING_EXPIRY = '10m';
const USER_TYPES = ['admin', 'client'];

/**
 * Sign a short-lived token for a login awaiting its two-factor steps.
 * It carries no sid, so isAuth never accepts it as a session.
 * @param {'admin'|'client'} userType
 * @param {number} userId
 * @returns {string}
 */
function signPendingToken(userType, userId) {
    return signToken({ purpose: PENDING_PURPOSE, userType, userId }, PENDING_EXPIRY);
}

/**
 * Verify a pending token. Never throws.
 * @param {string} token
 * @returns {{userType: 'admin'|'client', userId: number}|null}
 */
function verifyPendingToken(token) {
    try {
        const d = jwt.verify(token, process.env.JWT_SECRET);
        if (d.purpose !== PENDING_PURPOSE || !USER_TYPES.includes(d.userType)) return null;
        return { userType: d.userType, userId: d.userId };
    } catch {
        return null;
    }
}

/**
 * Next two-factor step an admin must complete.
 * @param {{email_verified_at: ?Date, totp_enabled_at: ?Date}} row
 * @returns {'verify_email'|'setup_totp'|'enter_code'}
 */
function nextAdminStep(row) {
    if (row.email_verified_at == null) return 'verify_email';
    if (row.totp_enabled_at == null) return 'setup_totp';
    return 'enter_code';
}

module.exports = { signPendingToken, verifyPendingToken, nextAdminStep };
