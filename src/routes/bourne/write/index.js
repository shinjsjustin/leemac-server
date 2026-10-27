const express = require('express');
const { MulterError } = require('multer');
const { isBourneWrite, bourneWriteLimiter } = require('../../../middleware/isBourneWrite');
const { auditWrites } = require('../../../lib/bourne/auditLog');
const { createQuoteJob, QuoteJobError } = require('../../../lib/quoteJob');
const { jobFileUpload, insertJobFiles } = require('../../../lib/jobFiles');
const { insertPartFiles } = require('../../../lib/partFiles');
const { PoError, validatePoFields, updateJobPo } = require('../../../lib/jobPo');
const { registerJobPartRoutes } = require('./jobParts');
const { registerDrawingRoutes } = require('./drawings');
const { registerEmailRoutes } = require('./emails');
const { QuoteExportError, exportQuote: defaultExportQuote, exportJob: defaultExportJob } = require('../../../lib/quoteExport');

const HTTP_CREATED = 201;
const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;
const HTTP_NOT_ALLOWED = 405;
const HTTP_TOO_LARGE = 413;
const HTTP_SERVER_ERROR = 500;

// Same multer error mapping as src/routes/job/files.js.
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

const receiveFiles = receive(jobFileUpload.array('files'));

function createBourneWriteRouter({
    db = require('../../../db/db'),
    limiter = bourneWriteLimiter,
    exportQuote = defaultExportQuote,
    exportJob = defaultExportJob,
} = {}) {
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

    async function requirePart(req, res, next) {
        try {
            const [rows] = await db.execute('SELECT id FROM part WHERE id = ?', [req.params.id]);
            if (rows.length === 0) return res.status(HTTP_NOT_FOUND).json({ error: 'Part not found' });
            next();
        } catch (e) {
            console.error(e);
            res.status(HTTP_SERVER_ERROR).json({ error: 'Failed to look up part' });
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

    router.post('/parts/:id/files', requirePart, receiveFiles, async (req, res) => {
        if (!req.files || req.files.length === 0) {
            return res.status(HTTP_BAD_REQUEST).json({ error: 'At least one file is required' });
        }
        try {
            res.status(HTTP_CREATED).json({ ids: await insertPartFiles(db, req.params.id, req.files) });
        } catch (e) {
            console.error(e);
            res.status(HTTP_SERVER_ERROR).json({ error: 'Failed to upload files' });
        }
    });

    router.post('/jobs/:id/po', requireJob, async (req, res) => {
        try {
            const fields = validatePoFields(req.body, { partial: true });
            await updateJobPo(db, req.params.id, fields, { onlyPresent: true });
            res.json({ id: req.params.id });
        } catch (e) {
            if (e instanceof PoError) return res.status(e.status).json({ error: e.message });
            console.error(e);
            res.status(HTTP_SERVER_ERROR).json({ error: 'Failed to update PO' });
        }
    });

    // exportQuote answers 404 for a missing job itself, so no requireJob here.
    router.post('/jobs/:id/export-quote', async (req, res) => {
        try {
            res.json(await exportQuote(db, req.params.id));
        } catch (e) {
            if (e instanceof QuoteExportError) return res.status(e.status).json({ error: e.message });
            console.error(e);
            res.status(HTTP_SERVER_ERROR).json({ error: 'Failed to export quote' });
        }
    });

    router.post('/jobs/:id/export', async (req, res) => {
        const type = req.body && req.body.type;
        if (!type) {
            return res.status(HTTP_BAD_REQUEST).json({ error: 'type is required: quote, order, invoice, packing or shipping' });
        }
        try {
            res.json(await exportJob(db, req.params.id, type));
        } catch (e) {
            if (e instanceof QuoteExportError) return res.status(e.status).json({ error: e.message });
            console.error(e);
            res.status(HTTP_SERVER_ERROR).json({ error: 'Failed to export' });
        }
    });

    registerDrawingRoutes(router, { db, requireJob, receive });
    registerJobPartRoutes(router, { db, requireJob, requirePart });
    registerEmailRoutes(router, { db });

    router.use((req, res) => res.status(HTTP_NOT_FOUND).json({ error: 'Not found' }));

    return router;
}

module.exports = createBourneWriteRouter();
module.exports.createBourneWriteRouter = createBourneWriteRouter;
