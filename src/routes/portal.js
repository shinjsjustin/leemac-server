const express = require('express');
const db = require('../db/db');
const portal = require('../lib/portal');
const { getOverview } = require('../lib/portalOverview');
const { auditPortal } = require('../lib/portalAudit');
const { createIsAuth } = require('../middleware/isAuth');
const { requireClient } = require('../middleware/requireRole');
const { portalFloodLimiter, portalLimiter } = require('../lib/auth');

const router = express.Router();

const ID_PATTERN = /^[1-9]\d{0,9}$/;
const NOT_FOUND = { error: 'Not found' };
const UNSAFE_FILENAME_CHARS = /["\r\n]/g;

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
    res.set('Allow', 'GET, HEAD');
    res.status(405).json({ error: 'Method not allowed' });
});

// Wraps a handler: a bad id or null result is 404, anything else thrown is logged and a generic 500.
function handle(run) {
    return async (req, res) => {
        if (req.params.id !== undefined && !ID_PATTERN.test(req.params.id)) {
            return res.status(404).json(NOT_FOUND);
        }
        try {
            const result = await run(req, res, Number(req.params.id));
            if (result === null) return res.status(404).json(NOT_FOUND);
            if (result !== undefined) res.json(result);
        } catch (error) {
            console.error('Portal error:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    };
}

const companyOf = (req) => req.user.company_id;

router.get('/overview', handle((req) => getOverview(db, req.user, req.query)));
router.get('/jobs', handle((req) => portal.listJobs(db, companyOf(req), req.query)));
router.get('/jobs/:id', handle((req, res, id) => portal.getJob(db, companyOf(req), id)));
router.get('/parts', handle((req) => portal.listParts(db, companyOf(req), req.query)));
router.get('/parts/:id', handle((req, res, id) => portal.getPart(db, companyOf(req), id)));
router.get('/parts/:id/files', handle((req, res, id) => portal.listPartFiles(db, companyOf(req), id)));
router.get('/files/:id', handle(async (req, res, id) => {
    const file = await portal.getPartFile(db, companyOf(req), id);
    if (!file) return null;
    const filename = String(file.filename).replace(UNSAFE_FILENAME_CHARS, '');
    res.set({
        'Content-Type': /^[\w.+-]+\/[\w.+-]+$/.test(file.mimetype) ? file.mimetype : 'application/octet-stream',
        'Content-Length': file.content.length,
        'Content-Disposition': `attachment; filename="${filename}"`,
    });
    res.end(file.content);
}));

router.use((req, res) => res.status(404).json(NOT_FOUND));

module.exports = router;
