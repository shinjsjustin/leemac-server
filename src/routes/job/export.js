const express = require('express');
const defaultDb = require('../../db/db');
const quoteExport = require('../../lib/quoteExport');
const { requireAdmin } = require('../../middleware/requireRole');

const EXPORT_ACCESS_LEVEL = 3;

function createJobExportRouter({ db, exportJobs }) {
    const router = express.Router();

    // POST domain.com/api/internal/job/export?id=<jobId>  body: { types: [...] } or { type: '...' }
    // Runs the Apps Script exports on the server and saves the PDFs. Admin level 3 only.
    router.post('/export', requireAdmin(EXPORT_ACCESS_LEVEL), async (req, res) => {
        const { id } = req.query;
        if (!id) return res.status(400).json({ error: 'Job ID is required' });
        const { types, type } = req.body || {};
        const requested = Array.isArray(types) ? types : [type];

        try {
            const { results, failed, skipped } = await exportJobs(db, id, requested);
            if (!failed) return res.status(200).json({ results, skipped: [] });
            res.status(failed.status).json({ error: failed.error, failedType: failed.type, results, skipped });
        } catch (err) {
            if (err instanceof quoteExport.QuoteExportError) return res.status(err.status).json({ error: err.message });
            console.error('Error exporting job:', err);
            res.status(500).json({ error: 'Export failed' });
        }
    });

    return router;
}

module.exports = createJobExportRouter({ db: defaultDb, exportJobs: quoteExport.exportJobs });
module.exports.createJobExportRouter = createJobExportRouter;
