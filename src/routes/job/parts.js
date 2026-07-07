const express = require('express');
const router = express.Router();
const db = require('../../db/db');

// POST domain.com/api/internal/job/jobpartjoin
// Link a part to a job with quantity, price, revision, and details. Affects: job_part table.
router.post('/jobpartjoin', async (req, res) => {
    const { jobId, partId, quantity, price, rev, details } = req.body;

    try {
        const [result] = await db.execute(
            `INSERT INTO job_part (job_id, part_id, quantity, price, rev, details) VALUES (?, ?, ?, ?, ?, ?)`,
            [jobId, partId, quantity, price, rev, details]
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
    const { jobId, partId, quantity, price, rev, details, note } = req.body;

    if (!jobId || !partId || quantity === undefined) {
        return res.status(400).json({ error: 'Job ID, Part ID, and Quantity are required' });
    }

    try {
        await db.execute(
            `UPDATE job_part SET quantity = ?, price = ?, rev = ?, details = ?, note = ? WHERE job_id = ? AND part_id = ?`,
            [quantity, price, rev, details, note ?? null, jobId, partId]
        );
        res.status(200).json({ message: 'Part details updated successfully' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to update part details' });
    }
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
