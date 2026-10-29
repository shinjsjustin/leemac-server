const express = require('express');
const defaultDb = require('../db/db');
const clientNotes = require('../lib/clientNotes');
const { auditPortal } = require('../lib/portalAudit');
const { createIsAuth } = require('../middleware/isAuth');
const { requireClient } = require('../middleware/requireRole');
const { portalFloodLimiter, portalLimiter, portalWriteLimiter } = require('../lib/auth');

const { ClientNoteError } = clientNotes;

const ID_PATTERN = /^[1-9]\d{0,9}$/;
const NOT_FOUND = { error: 'Not found' };
const HTTP_NOT_FOUND = 404;
const HTTP_CREATED = 201;

function validateId(req, res, next, value) {
    if (!ID_PATTERN.test(value)) return res.status(HTTP_NOT_FOUND).json(NOT_FOUND);
    next();
}

// Wraps a handler: ClientNoteError keeps its status, anything else is a generic 500.
function handle(run) {
    return async (req, res) => {
        try {
            const result = await run(req);
            res.status(result.status || 200).json(result.body);
        } catch (error) {
            if (error instanceof ClientNoteError) {
                return res.status(error.status).json({ error: error.message });
            }
            console.error('Portal notes error:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    };
}

function createPortalNotesRouter({ db = defaultDb, writeLimiter = portalWriteLimiter } = {}) {
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

    router.get('/', handle(async (req) => ({ body: await clientNotes.listNotes(db, req.user) })));
    router.post('/', handle(async (req) => {
        const created = await clientNotes.addNote(db, req.user, req.body || {});
        return { status: HTTP_CREATED, body: { id: created.id } };
    }));
    router.put('/:id', handle(async (req) => {
        await clientNotes.editNote(db, req.user, Number(req.params.id), req.body || {});
        return { body: { ok: true } };
    }));
    router.delete('/:id', handle(async (req) => {
        await clientNotes.deleteNote(db, req.user, Number(req.params.id));
        return { body: { ok: true } };
    }));

    router.use((req, res) => res.status(HTTP_NOT_FOUND).json(NOT_FOUND));

    return router;
}

module.exports = createPortalNotesRouter();
module.exports.createPortalNotesRouter = createPortalNotesRouter;
