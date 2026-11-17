const express = require('express');
const shareLinks = require('../lib/shareLinks');
const { portalFloodLimiter } = require('../lib/auth');

// The token travels in the body only: request paths are logged.
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const ID_PATTERN = /^[1-9]\d{0,9}$/;
const NOT_FOUND = { error: 'Not found' };
const HTTP_NOT_FOUND = 404;

const validToken = (body) => (typeof body?.token === 'string' && TOKEN_PATTERN.test(body.token) ? body.token : null);
// Ids arrive as JSON numbers; the string pattern keeps them to 1-10 plain digits.
const validId = (value) => (Number.isInteger(value) && ID_PATTERN.test(String(value)) ? value : null);

function noStore(req, res, next) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
}

// Wraps a handler: a null result is the one 404 for every miss, anything else is a generic 500.
function handle(run) {
    return async (req, res) => {
        try {
            const result = await run(req.body);
            if (!result) return res.status(HTTP_NOT_FOUND).json(NOT_FOUND);
            res.json(result);
        } catch (error) {
            console.error('Public share link error:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    };
}

// Like handle, for routes that answer with a stored file.
function handleFile(run) {
    return async (req, res) => {
        try {
            const file = await run(req.body);
            if (!file) return res.status(HTTP_NOT_FOUND).json(NOT_FOUND);
            res.setHeader('Content-Type', file.mimetype);
            res.end(file.content);
        } catch (error) {
            console.error('Public share link error:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    };
}

// No login: the token is the credential. Mounted before the catch-all, without isAuth.
function createShareRouter({ db }) {
    const router = express.Router();
    router.use(portalFloodLimiter);
    router.use(noStore);

    router.post('/quote', handle((body) => {
        const token = validToken(body);
        return token && shareLinks.openQuote(db, token);
    }));
    router.post('/quote/pdf', handleFile((body) => {
        const token = validToken(body);
        return token && shareLinks.quotePdf(db, token);
    }));
    router.post('/qc', handle((body) => {
        const token = validToken(body);
        return token && shareLinks.openQc(db, token);
    }));
    router.post('/qc/drawing', handleFile((body) => {
        const token = validToken(body);
        const fileId = validId(body?.file_id);
        return token && fileId && shareLinks.qcDrawing(db, token, fileId);
    }));
    router.post('/qc/photo', handleFile((body) => {
        const token = validToken(body);
        const photoId = validId(body?.photo_id);
        return token && photoId && shareLinks.qcPhoto(db, token, photoId);
    }));

    return router;
}

module.exports = { createShareRouter };
