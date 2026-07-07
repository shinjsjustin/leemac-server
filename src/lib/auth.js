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

/**
 * Per-route rate limiter for login and register endpoints.
 * Max 10 requests per IP per 15-minute window.
 * Applied only to auth entry points (login, register) — not to change-password
 * or change-email/username endpoints used by already-authenticated users.
 */
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' },
});

module.exports = { hashPassword, verifyPassword, signToken, authLimiter };
