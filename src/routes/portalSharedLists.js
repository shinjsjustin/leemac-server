const express = require('express');
const shared = require('../lib/sharedPartLists');
const { createRequestFromSharedList, getSharedRequestLines } = require('../lib/partListRequest');
const { QuoteRequestError } = require('../lib/quoteRequests');
const { notifyQuoteRequest } = require('../lib/quoteRequestMail');

const { SharedPartListError } = shared;

const ID_PATTERN = /^[1-9]\d{0,9}$/;
// The token travels in the body only: auditPortal logs request paths.
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const NOT_FOUND = { error: 'Not found' };
const HTTP_NOT_FOUND = 404;
const HTTP_CREATED = 201;

function validateId(req, res, next, value) {
    if (!ID_PATTERN.test(value)) return res.status(HTTP_NOT_FOUND).json(NOT_FOUND);
    next();
}

// Wraps a handler: a null result is 404, known errors keep their status, anything else is a generic 500.
function handle(run) {
    return async (req, res) => {
        try {
            const result = await run(req, res);
            if (result === null) return res.status(HTTP_NOT_FOUND).json(NOT_FOUND);
            res.status(result.status || 200).json(result.body);
        } catch (error) {
            if (error instanceof SharedPartListError || error instanceof QuoteRequestError) {
                return res.status(error.status).json({ error: error.message });
            }
            console.error('Portal shared lists error:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    };
}

const ok = (body) => (body === null ? null : { body });
const inviteToken = (req) => {
    const token = req.body && req.body.token;
    return typeof token === 'string' && TOKEN_PATTERN.test(token) ? token : null;
};

// Mounted under the portal lists router, which supplies login, client-only, limits and audit.
function createSharedListsRouter({ db, send }) {
    const router = express.Router();
    router.param('id', validateId);

    const user = (req) => req.user;
    const listId = (req) => Number(req.params.id);

    router.get('/', handle(async (req) => ok(await shared.listSharedLists(db, user(req)))));
    router.post('/invite', handle(async (req) => {
        const token = inviteToken(req);
        return token && ok(await shared.getInvite(db, user(req), token));
    }));
    router.post('/invite/join', handle(async (req) => {
        const token = inviteToken(req);
        return token && ok(await shared.joinList(db, user(req), token));
    }));
    router.get('/:id', handle(async (req) => ok(await shared.getSharedList(db, user(req), listId(req)))));
    router.put('/:id', handle(async (req) => ok(await shared.renameList(db, user(req), listId(req), req.body))));
    router.post('/:id/parts', handle(async (req) => ok(await shared.addParts(db, user(req), listId(req), req.body))));
    router.post('/:id/parts/remove', handle(async (req) => ok(await shared.removeParts(db, user(req), listId(req), req.body))));
    router.post('/:id/leave', handle(async (req) => {
        const left = await shared.leaveList(db, user(req), listId(req));
        return left === null ? null : { body: { ok: true } };
    }));
    router.get('/:id/request-lines', handle(async (req) => ok(await getSharedRequestLines(db, user(req), listId(req)))));
    router.post('/:id/request', handle(async (req) => {
        const request = await createRequestFromSharedList(db, user(req), listId(req), req.body);
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

module.exports = { createSharedListsRouter };
