const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');

const BCRYPT_ROUNDS = 10;

/**
 * Hash a plain-text password.
 * @param {string} plain
 * @returns {Promise<string>}
 */
async function hashPassword(plain) {
    return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

/**
 * Compare a plain-text password against a bcrypt hash.
 * @param {string} plain
 * @param {string} hash
 * @returns {Promise<boolean>}
 */
async function verifyPassword(plain, hash) {
    return bcrypt.compare(plain, hash);
}

/**
 * Sign a JWT with the application secret.
 * Expiry: 8h — matches existing admin and client token behavior.
 * Secret: process.env.JWT_SECRET
 * @param {object} payload
 * @returns {string}
 */
function signToken(payload) {
    return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '8h' });
}

const RATE_LIMIT_OPTIONS = {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' },
};

/**
 * Sign an admin token carrying its role and access level.
 * @param {{id: number, email: string, access_level: number}} row
 * @returns {string}
 */
function signAdminToken(row) {
    return signToken({ role: 'admin', id: row.id, email: row.email, access: row.access_level });
}

/**
 * Sign a client token carrying its role and company.
 * @param {{id: number, username: string, name: string, company_id: number}} row
 * @returns {string}
 */
function signClientToken(row) {
    return signToken({
        role: 'client',
        id: row.id,
        username: row.username,
        name: row.name,
        company_id: row.company_id,
    });
}

/**
 * Rate limiter for login and register endpoints.
 * Max 10 requests per IP per 15-minute window.
 */
const authLimiter = rateLimit(RATE_LIMIT_OPTIONS);

/**
 * Separate limiter (own counter) for change-password/email/username endpoints,
 * so those calls don't share a budget with login and register.
 */
const credentialLimiter = rateLimit(RATE_LIMIT_OPTIONS);

module.exports = {
    hashPassword,
    verifyPassword,
    signToken,
    signAdminToken,
    signClientToken,
    authLimiter,
    credentialLimiter,
};
