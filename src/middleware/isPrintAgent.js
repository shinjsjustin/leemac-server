const rateLimit = require('express-rate-limit');
const { verifyToken } = require('../lib/printAgentToken');

const BEARER_PREFIX = /^Bearer /;

function createIsPrintAgent(db) {
    return async function isPrintAgent(req, res, next) {
        const header = req.headers.authorization || '';
        const token = BEARER_PREFIX.test(header) ? header.replace(BEARER_PREFIX, '') : '';
        try {
            if (!(await verifyToken(db, token))) return res.status(401).json({ error: 'Invalid print agent token.' });
        } catch (error) {
            console.error('Print agent auth error:', error);
            return res.status(500).json({ error: 'Internal Server Error' });
        }
        next();
    };
}

const printAgentLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' },
});

module.exports = { createIsPrintAgent, printAgentLimiter };
