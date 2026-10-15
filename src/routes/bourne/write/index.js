const express = require('express');
const { MulterError } = require('multer');
const { isBourneWrite, bourneWriteLimiter } = require('../../../middleware/isBourneWrite');
const { auditWrites } = require('../../../lib/bourne/auditLog');
const { createQuoteJob, QuoteJobError } = require('../../../lib/quoteJob');
const { jobFileUpload, insertJobFiles } = require('../../../lib/jobFiles');
const { PoError, validatePoFields, updateJobPo } = require('../../../lib/jobPo');

const HTTP_CREATED = 201;
const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;
const HTTP_NOT_ALLOWED = 405;
const HTTP_TOO_LARGE = 413;
const HTTP_SERVER_ERROR = 500;

// Same multer error mapping as src/routes/job/files.js.
function receiveFiles(req, res, next) {
    jobFileUpload.array('files')(req, res, (err) => {
        if (!err) return next();
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(HTTP_TOO_LARGE).json({ error: 'File exceeds the 20 MB limit' });
        }
        if (err.code === 'FILE_TYPE_NOT_ALLOWED' || err instanceof MulterError) {
            return res.status(HTTP_BAD_REQUEST).json({ error: err.message });
        }
        next(err);
    });
}

function createBourneWriteRouter({ db = require('../../../db/db'), limiter = bourneWriteLimiter } = {}) {
    const router = express.Router();

    async function requireJob(req, res, next) {
        try {
            const [rows] = await db.execute('SELECT id FROM job WHERE id = ?', [req.params.id]);
            if (rows.length === 0) return res.status(HTTP_NOT_FOUND).json({ error: 'Job not found' });
            next();
        } catch (e) {
            console.error(e);
            res.status(HTTP_SERVER_ERROR).json({ error: 'Failed to look up job' });
        }
    }

    router.use(auditWrites(db), limiter, isBourneWrite);
    router.use((req, res, next) => {
        if (req.method === 'POST') return next();
        res.set('Allow', 'POST').status(HTTP_NOT_ALLOWED).json({ error: 'Method not allowed.' });
    });

    router.post('/jobs/quote', async (req, res) => {
        try {
            res.status(HTTP_CREATED).json(await createQuoteJob(db, req.body));
        } catch (e) {
            if (e instanceof QuoteJobError) return res.status(e.status).json({ error: e.message });
            console.error(e);
            res.status(HTTP_SERVER_ERROR).json({ error: 'Failed to create quote job' });
        }
    });

    router.post('/jobs/:id/files', requireJob, receiveFiles, async (req, res) => {
        if (!req.files || req.files.length === 0) {
            return res.status(HTTP_BAD_REQUEST).json({ error: 'At least one file is required' });
        }
        try {
            res.status(HTTP_CREATED).json({ ids: await insertJobFiles(db, req.params.id, req.files) });
        } catch (e) {
            console.error(e);
            res.status(HTTP_SERVER_ERROR).json({ error: 'Failed to upload files' });
        }
    });

    router.post('/jobs/:id/po', requireJob, async (req, res) => {
        try {
            validatePoFields(req.body);
            await updateJobPo(db, req.params.id, req.body, { onlyPresent: true });
            res.json({ id: req.params.id });
        } catch (e) {
            if (e instanceof PoError) return res.status(e.status).json({ error: e.message });
            console.error(e);
            res.status(HTTP_SERVER_ERROR).json({ error: 'Failed to update PO' });
        }
    });

    router.use((req, res) => res.status(HTTP_NOT_FOUND).json({ error: 'Not found' }));

    return router;
}

module.exports = createBourneWriteRouter();
module.exports.createBourneWriteRouter = createBourneWriteRouter;
