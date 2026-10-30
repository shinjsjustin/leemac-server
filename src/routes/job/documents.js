const express = require('express');
const defaultDb = require('../../db/db');
const jobDocuments = require('../../lib/jobDocuments');
const { requireAdmin } = require('../../middleware/requireRole');

const MAKE_ACCESS_LEVEL = 3;
const VIEW_ACCESS_LEVEL = 1;

function createJobDocumentsRouter({ db, makeDocument, latestDocuments }) {
    const router = express.Router();

    const fail = (res, err, action) => {
        if (err instanceof jobDocuments.DocumentError) return res.status(err.status).json({ error: err.message });
        console.error(`Error ${action}:`, err);
        res.status(500).json({ error: `Failed ${action}` });
    };

    // POST domain.com/api/internal/job/documents/make?id=<jobId>&type=<type>
    router.post('/documents/make', requireAdmin(MAKE_ACCESS_LEVEL), async (req, res) => {
        const { id, type } = req.query;
        if (!id) return res.status(400).json({ error: 'Job ID is required' });
        try {
            res.status(201).json(await makeDocument(db, id, type));
        } catch (err) {
            fail(res, err, 'making document');
        }
    });

    // GET domain.com/api/internal/job/documents?id=<jobId>
    router.get('/documents', requireAdmin(VIEW_ACCESS_LEVEL), async (req, res) => {
        const { id } = req.query;
        if (!id) return res.status(400).json({ error: 'Job ID is required' });
        try {
            res.status(200).json(await latestDocuments(db, id));
        } catch (err) {
            fail(res, err, 'loading documents');
        }
    });

    return router;
}

module.exports = createJobDocumentsRouter({
    db: defaultDb,
    makeDocument: jobDocuments.makeDocument,
    latestDocuments: jobDocuments.latestDocuments,
});
module.exports.createJobDocumentsRouter = createJobDocumentsRouter;
