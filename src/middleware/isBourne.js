const crypto = require('crypto');
const rateLimit = require('express-rate-limit');

const ALLOWED_METHODS = ['GET', 'HEAD'];

function keyMatches(provided, expected) {
    const a = Buffer.from(String(provided ?? ''));
    const b = Buffer.from(expected);
    // timingSafeEqual throws on length mismatch
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function isBourne(req, res, next) {
    const expected = process.env.BOURNE_READ_KEY;
    if (!expected) return res.status(503).json({ error: 'Bourne access is not configured.' });
    if (!keyMatches(req.headers['x-bourne-key'], expected)) {
        return res.status(401).json({ error: 'Invalid Bourne key.' });
    }
    if (!ALLOWED_METHODS.includes(req.method)) {
        return res.set('Allow', 'GET').status(405).json({ error: 'Method not allowed.' });
    }
    next();
}

const bourneLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' },
});

module.exports = { isBourne, bourneLimiter };
