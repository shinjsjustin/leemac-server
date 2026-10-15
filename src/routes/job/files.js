const express = require('express');
const { MulterError } = require('multer');
const router = express.Router();
const db = require('../../db/db');
const { jobFileUpload, insertJobFiles, listJobFiles } = require('../../lib/jobFiles');

// Runs the multer parse and maps its failures to JSON errors.
function receiveFiles(req, res, next) {
    jobFileUpload.array('files')(req, res, (err) => {
        if (!err) return next();
        if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'File exceeds the 20 MB limit' });
        if (err.code === 'FILE_TYPE_NOT_ALLOWED' || err instanceof MulterError) {
            return res.status(400).json({ error: err.message });
        }
        next(err);
    });
}

// POST domain.com/api/internal/job/uploadfile?id=<jobId>
// Attach RFQ/PO files to a job. Affects: uploaded_files table.
router.post('/uploadfile', (req, res, next) => {
    if (!req.query.id) return res.status(400).json({ error: 'Job ID is required' });
    next();
}, receiveFiles, async (req, res) => {
    if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'At least one file is required' });
    }
    try {
        const ids = await insertJobFiles(db, req.query.id, req.files);
        res.status(201).json({ ids });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to upload files' });
    }
});

// GET domain.com/api/internal/job/files?jobId=<jobId>
// List file metadata for a job (never content). Reads: uploaded_files table.
router.get('/files', async (req, res) => {
    if (!req.query.jobId) return res.status(400).json({ error: 'Job ID is required' });
    try {
        res.json(await listJobFiles(db, req.query.jobId));
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to fetch files' });
    }
});

module.exports = router;
