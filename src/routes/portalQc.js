const express = require('express');
const defaultDb = require('../db/db');
const qcMarkings = require('../lib/qcMarkings');
const qcPhotos = require('../lib/qcPhotos');
const { auditPortal } = require('../lib/portalAudit');
const { createIsAuth } = require('../middleware/isAuth');
const { requireClient } = require('../middleware/requireRole');
const { portalFloodLimiter, portalLimiter, portalWriteLimiter } = require('../lib/auth');

const { QcError } = qcMarkings;

const ID_PATTERN = /^[1-9]\d{0,9}$/;
const NOT_FOUND = { error: 'Not found' };
const HTTP_NOT_FOUND = 404;
const HTTP_CREATED = 201;
const OK = { ok: true };

function validateId(req, res, next, value) {
    if (!ID_PATTERN.test(value)) return res.status(HTTP_NOT_FOUND).json(NOT_FOUND);
    next();
}

// Wraps a handler: QcError keeps its status, anything else is a generic 500.
// A handler may return { send } to answer with its own response.
function handle(run) {
    return async (req, res) => {
        try {
            const result = await run(req, res);
            if (result.send) return result.send();
            res.status(result.status || 200).json(result.body);
        } catch (error) {
            if (error instanceof QcError) {
                return res.status(error.status).json({ error: error.message });
            }
            console.error('Portal QC error:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    };
}

// Only the client's own markings can be changed; Leemac's and other companies' are not found.
async function ownMarkingPartId(db, user, id) {
    const [rows] = await db.execute('SELECT part_id FROM qc_marking WHERE id = ? AND company_id = ?', [
        id, user.company_id,
    ]);
    if (rows.length === 0) throw new QcError('Not found', HTTP_NOT_FOUND);
    return rows[0].part_id;
}

function createPortalQcRouter({ db = defaultDb, writeLimiter = portalWriteLimiter } = {}) {
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

    router.get('/parts/:id', handle(async (req) => {
        const partId = Number(req.params.id);
        const markings = await qcMarkings.listForClient(db, req.user, partId);
        const photos = await qcPhotos.listForClient(db, req.user, partId);
        return { body: { markings, photos } };
    }));
    router.post('/parts/:id/markings', handle(async (req) => {
        const created = await qcMarkings.createMarking(db, req.user, Number(req.params.id), req.body || {});
        return { status: HTTP_CREATED, body: { id: created.id } };
    }));
    router.delete('/parts/:id/markings', handle(async (req) => {
        await qcMarkings.clearMarkings(db, req.user, Number(req.params.id));
        return { body: OK };
    }));
    router.post('/parts/:id/ping', handle(async (req) => {
        await qcMarkings.ping(db, req.user, Number(req.params.id));
        return { body: OK };
    }));
    router.put('/markings/:id', handle(async (req) => {
        const id = Number(req.params.id);
        const partId = await ownMarkingPartId(db, req.user, id);
        await qcMarkings.updateMarking(db, req.user, partId, id, req.body || {});
        return { body: OK };
    }));
    router.delete('/markings/:id', handle(async (req) => {
        const id = Number(req.params.id);
        const partId = await ownMarkingPartId(db, req.user, id);
        await qcMarkings.deleteMarking(db, req.user, partId, id);
        return { body: OK };
    }));
    router.get('/photos/:id', handle(async (req, res) => {
        const photo = await qcPhotos.getPhotoForClient(db, req.user, Number(req.params.id));
        // setHeader keeps the stored mimetype exact; res.set would append a charset.
        res.setHeader('Content-Type', photo.mimetype);
        return { send: () => res.end(photo.content) };
    }));

    router.use((req, res) => res.status(HTTP_NOT_FOUND).json(NOT_FOUND));

    return router;
}

module.exports = createPortalQcRouter();
module.exports.createPortalQcRouter = createPortalQcRouter;
