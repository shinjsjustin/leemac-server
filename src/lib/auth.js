const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

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
 * Secret: process.env.JWT_SECRET
 * @param {object} payload
 * @param {string} [expiresIn='8h']
 * @returns {string}
 */
function signToken(payload, expiresIn = '8h') {
    return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn });
}

/**
 * Sign an admin token carrying its role and access level.
 * @param {{id: number, email: string, access_level: number}} row
 * @param {string} sid auth_session id
 * @returns {string}
 */
function signAdminToken(row, sid) {
    return signToken({ role: 'admin', id: row.id, email: row.email, access: row.access_level, sid }, '8h');
}

/**
 * Sign a client token carrying its role and company.
 * @param {{id: number, username: string, name: string, company_id: number}} row
 * @param {string} sid auth_session id
 * @returns {string}
 */
function signClientToken(row, sid) {
    return signToken({
        role: 'client',
        id: row.id,
        username: row.username,
        name: row.name,
        company_id: row.company_id,
        sid,
    }, '7d');
}

const FIFTEEN_MINUTES = 15 * 60 * 1000;
const ONE_HOUR = 60 * 60 * 1000;

function makeLimiter(windowMs, limit, keyGenerator) {
    return rateLimit({
        windowMs,
        limit,
        standardHeaders: true,
        legacyHeaders: false,
        message: { error: 'Too many attempts. Try again later.' },
        ...(keyGenerator && { keyGenerator }),
    });
}

// Counts per IP + route + account, so one account's failures don't lock out
// the rest of a shared office IP.
function accountLimiter(windowMs, limit, getAccount) {
    return makeLimiter(windowMs, limit, (req) =>
        `${ipKeyGenerator(req.ip)}|${req.baseUrl}|${getAccount(req)}`);
}

// mfaPending.js requires this file, so it can't be required at the top.
function pendingAccount(req) {
    const pending = require('./mfaPending').verifyPendingToken(req.body?.pendingToken);
    return pending ? `${pending.userType}:${pending.userId}` : null;
}

function mfaAccount(req) {
    return pendingAccount(req) ?? 'invalid';
}

function emailAccount(req) {
    if (req.user) return `${req.user.role}:${req.user.id}`;
    return pendingAccount(req) ?? String(req.body?.email ?? '').trim().toLowerCase();
}

/** Login: 10 per 15 min per IP + account (email). */
const loginLimiter = accountLimiter(FIFTEEN_MINUTES, 10, (req) =>
    String(req.body?.email ?? '').trim().toLowerCase());

/** Two-factor codes: 20 per 15 min per IP + account (pending token user). */
const mfaLimiter = accountLimiter(FIFTEEN_MINUTES, 20, mfaAccount);

/** Auth flood guard: 100 per 15 min per IP across accounts. */
const authFloodLimiter = makeLimiter(FIFTEEN_MINUTES, 100);

/** Email sends: 10 per 60 min per IP + account. */
const emailLimiter = accountLimiter(ONE_HOUR, 10, emailAccount);

/** Email flood guard: 30 per 60 min per IP across accounts. */
const emailFloodLimiter = makeLimiter(ONE_HOUR, 30);

/** Invites: 50 per 60 min per IP + admin id; mount after isAuth. */
const inviteLimiter = accountLimiter(ONE_HOUR, 50, (req) => `admin:${req.user.id}`);

/**
 * Change-password/email/username endpoints: 30 per 15 min per IP, with its
 * own counter apart from login.
 */
const credentialLimiter = makeLimiter(FIFTEEN_MINUTES, 30);

module.exports = {
    loginLimiter,
    mfaLimiter,
    authFloodLimiter,
    emailLimiter,
    emailFloodLimiter,
    inviteLimiter,
    hashPassword,
    verifyPassword,
    signToken,
    signAdminToken,
    signClientToken,
    credentialLimiter,
};
