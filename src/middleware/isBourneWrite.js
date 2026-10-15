const crypto = require('crypto');
const rateLimit = require('express-rate-limit');

const WRITE_ACTOR = 'bourne-write';
const DEFAULT_WRITE_MAX = 30;

function keyMatches(provided, expected) {
    const a = Buffer.from(String(provided ?? ''));
    const b = Buffer.from(expected);
    // timingSafeEqual throws on length mismatch
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function isBourneWrite(req, res, next) {
    const expected = process.env.BOURNE_WRITE_KEY;
    // The read key must never grant writes.
    if (!expected || expected === process.env.BOURNE_READ_KEY) {
        return res.status(503).json({ error: 'Bourne writes are not configured.' });
    }
    if (!keyMatches(req.headers['x-bourne-key'], expected)) {
        return res.status(401).json({ error: 'Invalid Bourne key.' });
    }
    req.bourneActor = WRITE_ACTOR;
    next();
}

function createWriteLimiter({ max = DEFAULT_WRITE_MAX } = {}) {
    return rateLimit({
        windowMs: 60 * 1000,
        max,
        standardHeaders: true,
        legacyHeaders: false,
        message: { error: 'Too many requests, please try again later.' },
    });
}

const bourneWriteLimiter = createWriteLimiter();

module.exports = { isBourneWrite, createWriteLimiter, bourneWriteLimiter };
