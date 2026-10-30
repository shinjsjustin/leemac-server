const express = require('express');
const defaultDb = require('../../db/db');
const jobDocuments = require('../../lib/jobDocuments');
const { requireAdmin } = require('../../middleware/requireRole');

const MAKE_ACCESS_LEVEL = 3;
const VIEW_ACCESS_LEVEL = 1;

function createJobDocumentsRouter({ db, makeDocument, latestDocuments, getDocument, refillDocument, saveDocument }) {
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

    // GET domain.com/api/internal/job/documents/form?id=<jobId>&type=<type>
    router.get('/documents/form', requireAdmin(MAKE_ACCESS_LEVEL), async (req, res) => {
        const { id, type } = req.query;
        if (!id) return res.status(400).json({ error: 'Job ID is required' });
        try {
            res.status(200).json(await getDocument(db, id, type));
        } catch (err) {
            fail(res, err, 'loading document');
        }
    });

    // GET domain.com/api/internal/job/documents/refill?id=<jobId>&type=<type>
    router.get('/documents/refill', requireAdmin(MAKE_ACCESS_LEVEL), async (req, res) => {
        const { id, type } = req.query;
        if (!id) return res.status(400).json({ error: 'Job ID is required' });
        try {
            res.status(200).json(await refillDocument(db, id, type));
        } catch (err) {
            fail(res, err, 'refilling document');
        }
    });

    // PUT domain.com/api/internal/job/documents/save?id=<jobId>&type=<type>
    router.put('/documents/save', requireAdmin(MAKE_ACCESS_LEVEL), async (req, res) => {
        const { id, type } = req.query;
        if (!id) return res.status(400).json({ error: 'Job ID is required' });
        try {
            res.status(200).json(await saveDocument(db, id, type, req.body ?? {}, req.user));
        } catch (err) {
            fail(res, err, 'saving document');
        }
    });

    return router;
}

module.exports = createJobDocumentsRouter({
    db: defaultDb,
    makeDocument: jobDocuments.makeDocument,
    latestDocuments: jobDocuments.latestDocuments,
    getDocument: jobDocuments.getDocument,
    refillDocument: jobDocuments.refillDocument,
    saveDocument: jobDocuments.saveDocument,
});
module.exports.createJobDocumentsRouter = createJobDocumentsRouter;
