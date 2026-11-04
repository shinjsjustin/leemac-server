const express = require('express');
const { MulterError } = require('multer');
const router = express.Router();
const db = require('../db/db');
const { jobFileUpload, UPLOAD_LIMITS } = require('../lib/jobFiles');
const { insertPartFiles } = require('../lib/partFiles');

const MAX_NUMBER_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 255;

// Runs the multer parse and maps its failures to JSON errors.
function receiveFile(req, res, next) {
    jobFileUpload.single('file')(req, res, (err) => {
        if (!err) return next();
        if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'File exceeds the 20 MB limit' });
        if (err.code === 'FILE_TYPE_NOT_ALLOWED' || err instanceof MulterError) {
            return res.status(400).json({ error: err.message });
        }
        next(err);
    });
}

// POST domain.com/api/internal/part/pool
// Add a part to the pool; a duplicate number is a 409. Affects: part table.
router.post('/pool', async (req, res) => {
    const number = String(req.body?.number ?? '').trim();
    const description = String(req.body?.description ?? '').trim();
    if (!number) return res.status(400).json({ error: 'Part number is required' });
    if (number.length > MAX_NUMBER_LENGTH) {
        return res.status(400).json({ error: `Part number is over ${MAX_NUMBER_LENGTH} characters` });
    }
    if (description.length > MAX_DESCRIPTION_LENGTH) {
        return res.status(400).json({ error: `Description is over ${MAX_DESCRIPTION_LENGTH} characters` });
    }
    try {
        const [result] = await db.execute(
            'INSERT IGNORE INTO part (number, description) VALUES (?, ?)',
            [number, description]
        );
        if (result.affectedRows === 0) return res.status(409).json({ error: 'Part number already exists' });
        res.status(201).json({ id: result.insertId, number });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to add part' });
    }
});

// POST domain.com/api/internal/part/pool/:id/files
// Attach one file (multipart field "file") to a pooled part. Affects: uploaded_files table.
router.post('/pool/:id/files', receiveFile, async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'A file is required' });
    try {
        const [parts] = await db.execute('SELECT id FROM part WHERE id = ?', [req.params.id]);
        if (parts.length === 0) return res.status(404).json({ error: 'Part not found' });
        const [[{ total }]] = await db.execute(
            'SELECT COUNT(*) AS total FROM uploaded_files WHERE part_id = ?',
            [req.params.id]
        );
        if (total >= UPLOAD_LIMITS.files) {
            return res.status(400).json({ error: `A part can have at most ${UPLOAD_LIMITS.files} files` });
        }
        const [id] = await insertPartFiles(db, req.params.id, [req.file]);
        res.status(201).json({ id });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to upload file' });
    }
});

module.exports = router;
