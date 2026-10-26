const express = require('express');
const router = express.Router();
const db = require('../../db/db');
const { normalizePrice } = require('../../lib/price');
const { JobPartError, updateJobPart } = require('../../lib/jobParts');

const PART_TEXT_FIELDS = ['material', 'finish', 'stock_size'];

const cleanText = (value) => {
    const text = typeof value === 'string' ? value.trim() : '';
    return text === '' ? null : text;
};

// POST domain.com/api/internal/job/jobpartjoin
// Link a part to a job with quantity, price, revision, and details. Affects: job_part table.
router.post('/jobpartjoin', async (req, res) => {
    const { jobId, partId, quantity, rev, details } = req.body;

    let price;
    try {
        price = normalizePrice(req.body.price);
    } catch (e) {
        return res.status(400).json({ error: e.message });
    }

    try {
        const [result] = await db.execute(
            `INSERT INTO job_part (job_id, part_id, quantity, price, rev, details, material, finish, stock_size) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [jobId, partId, quantity, price, rev, details, ...PART_TEXT_FIELDS.map((f) => cleanText(req.body[f]))]
        );
        res.status(201).json({ id: result.insertId });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Server error when linking part to job' });
    }
});

// POST domain.com/api/internal/job/updatejobpartjoin
// Update the quantity, price, revision, details, and note for an existing job-part link. Affects: job_part table.
router.post('/updatejobpartjoin', async (req, res) => {
    const { jobId, partId, quantity, rev, details, note } = req.body;

    if (!jobId || !partId || quantity === undefined) {
        return res.status(400).json({ error: 'Job ID, Part ID, and Quantity are required' });
    }

    let price;
    try {
        price = normalizePrice(req.body.price);
    } catch (e) {
        return res.status(400).json({ error: e.message });
    }

    // Only touch the part fields the client sent, so older clients keep their values.
    const sentFields = PART_TEXT_FIELDS.filter((f) => f in req.body);
    const setFields = ['quantity', 'price', 'rev', 'details', 'note', ...sentFields]
        .map((f) => `${f} = ?`)
        .join(', ');

    try {
        await db.execute(
            `UPDATE job_part SET ${setFields} WHERE job_id = ? AND part_id = ?`,
            [quantity, price, rev, details, note ?? null, ...sentFields.map((f) => cleanText(req.body[f])), jobId, partId]
        );
        res.status(200).json({ message: 'Part details updated successfully' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to update part details' });
    }
});

// POST domain.com/api/internal/job/updatejobparts
// Update many job-part links at once; one failure does not stop the rest. Affects: job_part table.
router.post('/updatejobparts', async (req, res) => {
    const { jobId, parts } = req.body;

    if (!jobId || !Array.isArray(parts) || parts.length === 0) {
        return res.status(400).json({ error: 'Job ID and a non-empty parts array are required' });
    }

    const canSetPrice = req.user?.access >= 2;
    const saved = [];
    const failed = [];
    for (const { job_part_id, ...fields } of parts) {
        if (!canSetPrice) delete fields.price;
        try {
            await updateJobPart(db, jobId, job_part_id, fields);
            saved.push(job_part_id);
        } catch (e) {
            if (!(e instanceof JobPartError)) console.error(e);
            failed.push({
                job_part_id,
                error: e instanceof JobPartError ? e.message : 'Failed to update part',
            });
        }
    }
    res.status(200).json({ saved, failed });
});

// DELETE domain.com/api/internal/job/jobpartremove
// Remove a part from a job by deleting the job-part link. Affects: job_part table.
router.delete('/jobpartremove', async (req, res) => {
    const { jobId, partId } = req.body;

    if (!jobId || !partId) {
        return res.status(400).json({ error: 'Job ID and Part ID are required' });
    }

    try {
        await db.execute(
            `DELETE FROM job_part WHERE job_id = ? AND part_id = ?`,
            [jobId, partId]
        );
        res.status(200).json({ message: 'Part removed from job successfully' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Server error when removing part from job' });
    }
});

module.exports = router;
