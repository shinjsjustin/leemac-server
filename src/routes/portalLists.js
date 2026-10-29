const express = require('express');
const defaultDb = require('../db/db');
const partLists = require('../lib/partLists');
const { getRequestLines, createRequestFromList } = require('../lib/partListRequest');
const { QuoteRequestError } = require('../lib/quoteRequests');
const { notifyQuoteRequest } = require('../lib/quoteRequestMail');
const { auditPortal } = require('../lib/portalAudit');
const { createIsAuth } = require('../middleware/isAuth');
const { requireClient } = require('../middleware/requireRole');
const { portalFloodLimiter, portalLimiter, portalListWriteLimiter } = require('../lib/auth');

const { PartListError } = partLists;

const ID_PATTERN = /^[1-9]\d{0,9}$/;
const NOT_FOUND = { error: 'Not found' };
const HTTP_NOT_FOUND = 404;
const HTTP_CREATED = 201;

function validateId(req, res, next, value) {
    if (!ID_PATTERN.test(value)) return res.status(HTTP_NOT_FOUND).json(NOT_FOUND);
    next();
}

// Wraps a handler: a null result is 404, PartListError and QuoteRequestError keep their status, anything else is a generic 500.
function handle(run) {
    return async (req, res) => {
        try {
            const result = await run(req, res);
            if (result === null) return res.status(HTTP_NOT_FOUND).json(NOT_FOUND);
            res.status(result.status || 200).json(result.body);
        } catch (error) {
            if (error instanceof PartListError || error instanceof QuoteRequestError) {
                return res.status(error.status).json({ error: error.message });
            }
            console.error('Portal lists error:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    };
}

// Resolve the mailer at send time so tests can stub it.
const defaultSend = (message) => require('../lib/mailer').sendMail(message);

const ok = (body) => (body === null ? null : { body });

function createPortalListsRouter({ db = defaultDb, writeLimiter = portalListWriteLimiter, send = defaultSend } = {}) {
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

    const user = (req) => req.user;
    const listId = (req) => Number(req.params.id);

    router.get('/', handle(async (req) => ok(await partLists.listLists(db, user(req)))));
    router.post('/', handle(async (req) => {
        const created = await partLists.createList(db, user(req), req.body);
        return { status: HTTP_CREATED, body: { id: created.id } };
    }));
    router.put('/:id', handle(async (req) => ok(await partLists.renameList(db, user(req), listId(req), req.body))));
    router.delete('/:id', handle(async (req) => {
        const removed = await partLists.deleteList(db, user(req), listId(req));
        return removed === null ? null : { body: { ok: true } };
    }));
    router.post('/:id/parts', handle(async (req) => ok(await partLists.addParts(db, user(req), listId(req), req.body))));
    router.post('/:id/parts/remove', handle(async (req) => ok(await partLists.removeParts(db, user(req), listId(req), req.body))));
    router.get('/:id/request-lines', handle(async (req) => ok(await getRequestLines(db, user(req), listId(req)))));
    router.post('/:id/request', handle(async (req) => {
        const request = await createRequestFromList(db, user(req), listId(req), req.body);
        if (!request) return null;
        try {
            await notifyQuoteRequest({ send, to: process.env.QUOTE_REQUEST_EMAIL, request });
        } catch (error) {
            console.error('Quote request notification failed:', error);
        }
        return { status: HTTP_CREATED, body: request };
    }));

    router.use((req, res) => res.status(HTTP_NOT_FOUND).json(NOT_FOUND));

    return router;
}

module.exports = createPortalListsRouter();
module.exports.createPortalListsRouter = createPortalListsRouter;
