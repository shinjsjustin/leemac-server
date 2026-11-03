const express = require('express');
const defaultDb = require('../db/db');
const { requireAdmin } = require('../middleware/requireRole');
const simpleJobs = require('../lib/simpleJobs');

const ID_PATTERN = /^[1-9]\d{0,9}$/;
const READ_LEVEL = 2;
const WRITE_LEVEL = 3;
const NO_BID_FAILURES = {
    not_found: [404, 'Not found'],
    has_po: [409, 'Job already has a PO'],
};

function createSimpleJobsRouter({ db = defaultDb } = {}) {
    const router = express.Router();

    const list = (load) => async (req, res) => {
        try {
            res.set('Cache-Control', 'no-store');
            res.json(await load(db, { page: req.query.page }));
        } catch (error) {
            console.error('Simple jobs error:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    };

    const noBid = (write) => async (req, res) => {
        if (!ID_PATTERN.test(req.params.id)) return res.status(404).json({ error: 'Not found' });
        try {
            const outcome = await write(Number(req.params.id), req.user.id);
            if (outcome === 'ok') return res.json({ ok: true });
            const [status, error] = NO_BID_FAILURES[outcome];
            res.status(status).json({ error });
        } catch (error) {
            console.error('Simple jobs error:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    };

    router.get('/overview', requireAdmin(READ_LEVEL), list(simpleJobs.listOverview));
    router.get('/quoted', requireAdmin(READ_LEVEL), list(simpleJobs.listQuoted));
    router.put('/jobs/:id/no-bid', requireAdmin(WRITE_LEVEL), noBid((id, adminId) => simpleJobs.setNoBid(db, id, adminId)));
    router.delete('/jobs/:id/no-bid', requireAdmin(WRITE_LEVEL), noBid((id) => simpleJobs.clearNoBid(db, id)));

    return router;
}

module.exports = createSimpleJobsRouter();
module.exports.createSimpleJobsRouter = createSimpleJobsRouter;
