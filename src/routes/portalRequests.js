const express = require('express');
const { MulterError } = require('multer');
const defaultDb = require('../db/db');
const quoteRequests = require('../lib/quoteRequests');
const { requestUpload, addRequestFiles, removeRequestFile, getRequestFile } = require('../lib/quoteRequestFiles');
const { notifyQuoteRequest } = require('../lib/quoteRequestMail');
const { auditPortal } = require('../lib/portalAudit');
const { createIsAuth } = require('../middleware/isAuth');
const { requireClient } = require('../middleware/requireRole');
const { portalFloodLimiter, portalLimiter, portalWriteLimiter } = require('../lib/auth');

const { QuoteRequestError } = quoteRequests;

const ID_PATTERN = /^[1-9]\d{0,9}$/;
const NOT_FOUND = { error: 'Not found' };
const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;
const HTTP_TOO_LARGE = 413;
const HTTP_CREATED = 201;
const UNSAFE_FILENAME_CHARS = /["\r\n]/g;
const MIMETYPE_PATTERN = /^[\w.+-]+\/[\w.+-]+$/;

// Same multer error mapping as receive() in src/routes/bourne/write/index.js.
const receive = (middleware) => (req, res, next) => {
    middleware(req, res, (err) => {
        if (!err) return next();
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(HTTP_TOO_LARGE).json({ error: 'File exceeds the 20 MB limit' });
        }
        if (err.code === 'FILE_TYPE_NOT_ALLOWED' || err instanceof MulterError) {
            return res.status(HTTP_BAD_REQUEST).json({ error: err.message });
        }
        next(err);
    });
};

const receiveFiles = receive(requestUpload.array('files'));

function validateId(req, res, next, value) {
    if (!ID_PATTERN.test(value)) return res.status(HTTP_NOT_FOUND).json(NOT_FOUND);
    next();
}

// Wraps a handler: a null result is 404, QuoteRequestError keeps its status, anything else is a generic 500.
function handle(run) {
    return async (req, res) => {
        try {
            const result = await run(req, res);
            if (res.writableEnded) return;
            if (result === null) return res.status(HTTP_NOT_FOUND).json(NOT_FOUND);
            res.status(result.status || 200).json(result.body);
        } catch (error) {
            if (error instanceof QuoteRequestError) return res.status(error.status).json({ error: error.message });
            console.error('Portal requests error:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    };
}

// Resolve the mailer at send time so tests can stub it.
const defaultSend = (message) => require('../lib/mailer').sendMail(message);

const ok = (body) => (body === null ? null : { body });

function createPortalRequestsRouter({ db = defaultDb, writeLimiter = portalWriteLimiter, send = defaultSend } = {}) {
    const router = express.Router();

    router.use(auditPortal());
    router.use((req, res, next) => {
        res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
        next();
    });
    router.use(portalFloodLimiter);
    router.use(createIsAuth({ invalidTokenStatus: 401 }));
    router.use(requireClient);
    router.use(portalLimiter);
    router.use((req, res, next) => {
        if (req.method === 'GET' || req.method === 'HEAD') return next();
        writeLimiter(req, res, next);
    });

    router.param('id', validateId);
    router.param('lineId', validateId);
    router.param('fileId', validateId);

    const user = (req) => req.user;
    const uploadTo = (getLineId) => handle(async (req) => {
        if (!req.files || req.files.length === 0) {
            throw new QuoteRequestError('At least one file is required', HTTP_BAD_REQUEST);
        }
        const ids = await addRequestFiles(db, user(req), Number(req.params.id), getLineId(req), req.files);
        return ids === null ? null : { status: HTTP_CREATED, body: { ids } };
    });

    router.get('/', handle(async (req) => ok(await quoteRequests.listRequests(db, user(req)))));
    router.post('/', handle(async (req) => {
        const created = await quoteRequests.createDraft(db, user(req), req.body);
        return { status: HTTP_CREATED, body: { id: created.id } };
    }));
    router.get('/:id', handle(async (req) => ok(await quoteRequests.getRequest(db, user(req), Number(req.params.id)))));
    router.put('/:id', handle(async (req) => ok(await quoteRequests.updateDraft(db, user(req), Number(req.params.id), req.body))));
    router.post('/:id/submit', handle(async (req) => {
        const request = await quoteRequests.submitRequest(db, user(req), Number(req.params.id));
        if (request) {
            try {
                await notifyQuoteRequest({ send, to: process.env.QUOTE_REQUEST_EMAIL, request });
            } catch (error) {
                console.error('Quote request notification failed:', error);
            }
        }
        return ok(request);
    }));
    router.post('/:id/files', receiveFiles, uploadTo(() => null));
    router.post('/:id/lines/:lineId/files', receiveFiles, uploadTo((req) => Number(req.params.lineId)));
    router.get('/:id/files/:fileId', handle(async (req, res) => {
        const file = await getRequestFile(db, user(req), Number(req.params.id), Number(req.params.fileId));
        if (!file) return null;
        const filename = String(file.filename).replace(UNSAFE_FILENAME_CHARS, '');
        res.set({
            'Content-Type': MIMETYPE_PATTERN.test(file.mimetype) ? file.mimetype : 'application/octet-stream',
            'Content-Length': file.content.length,
            'Content-Disposition': `attachment; filename="${filename}"`,
        });
        res.end(file.content);
    }));
    router.delete('/:id/files/:fileId', handle(async (req) => {
        const removed = await removeRequestFile(db, user(req), Number(req.params.id), Number(req.params.fileId));
        return removed === null ? null : { body: { ok: true } };
    }));

    router.use((req, res) => res.status(HTTP_NOT_FOUND).json(NOT_FOUND));
    // Errors thrown by multer middleware that receive() does not map.
    router.use((error, req, res, next) => {
        console.error('Portal requests error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    });

    return router;
}

module.exports = createPortalRequestsRouter();
module.exports.createPortalRequestsRouter = createPortalRequestsRouter;
