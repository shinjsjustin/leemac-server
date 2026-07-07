const express = require('express');
const router = express.Router();
const db = require('../../db/db');
const { VALID_STAR_STATUSES } = require('./shared');

// POST domain.com/api/internal/job/starjob
// Star a job_part for active shop floor tracking, tagged to a client (attention). Affects: stars table.
router.post('/starjob', async (req, res) => {
    const { jobPartId, attention } = req.body;

    if (!jobPartId) {
        return res.status(400).json({ error: 'Job Part ID is required' });
    }

    if (!attention) {
        return res.status(400).json({ error: 'Attention is required' });
    }

    try {
        await db.execute(
            `INSERT INTO stars (job_part_id, attention) VALUES (?, ?)`,
            [jobPartId, attention]
        );
        res.status(201).json({ message: 'Job part starred successfully' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to star job part' });
    }
});

// DELETE domain.com/api/internal/job/unstarjob
// Unstar a job_part from active tracking. Affects: stars table.
router.delete('/unstarjob', async (req, res) => {
    const { jobPartId } = req.body;

    if (!jobPartId) {
        return res.status(400).json({ error: 'Job Part ID is required' });
    }

    try {
        // Remove the job part from stars
        await db.execute(
            `DELETE FROM stars WHERE job_part_id = ?`,
            [jobPartId]
        );

        res.status(200).json({ 
            message: 'Job part unstarred successfully'
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to unstar job part' });
    }
});

// GET domain.com/api/internal/job/getstarredjobs
// Get all starred job_part IDs and their statuses (minimal). Reads: stars table.
router.get('/getstarredjobs', async (req, res) => {
    try {
        const [rows] = await db.execute(
            `SELECT job_part_id, status FROM stars`
        );
        res.status(200).json(rows);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to fetch starred jobs' });
    }
});

// GET domain.com/api/internal/job/getstarredjobsfull
// Get all starred job parts with full job, part, and company details. Reads: stars, job_part, part, job, company tables.
router.get('/getstarredjobsfull', async (req, res) => {
    try {
        const [rows] = await db.execute(
            `SELECT
                s.job_part_id,
                s.status,
                s.attention,
                s.nfc_tag_id,
                jp.id AS job_part_id,
                jp.quantity,
                jp.price,
                jp.rev,
                jp.details,
                jp.note AS part_note,
                p.id AS part_id,
                p.number AS part_number,
                p.description AS part_description,
                j.id AS job_id,
                j.job_number,
                j.attention,
                j.po_number,
                j.po_date,
                j.due_date,
                j.invoice_number,
                j.created_at,
                c.name AS company_name
             FROM stars s
             JOIN job_part jp ON s.job_part_id = jp.id
             JOIN part p ON jp.part_id = p.id
             JOIN job j ON jp.job_id = j.id
             JOIN company c ON j.company_id = c.id`
        );
        res.status(200).json(rows);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to fetch starred jobs' });
    }
});

// PUT domain.com/api/internal/job/updatestarjobstatus
// Update the production status of a starred job_part by its job_part ID. Affects: stars table.
router.put('/updatestarjobstatus', async (req, res) => {
    const { jobPartId, status } = req.body;

    if (!jobPartId || !status || !VALID_STAR_STATUSES.includes(status)) {
        return res.status(400).json({ error: 'Invalid job part ID or status' });
    }

    try {
        await db.execute(
            `UPDATE stars SET status = ? WHERE job_part_id = ?`,
            [status, jobPartId]
        );
        res.status(200).json({ message: 'Star status updated successfully' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to update star status' });
    }
});

// PUT domain.com/api/internal/job/updatestarstatusbyjobnumber
// Update the production status of a starred job_part identified by job number and part number. Affects: stars table.
router.put('/updatestarstatusbyjobnumber', async (req, res) => {
    const { jobNumber, partNumber, status } = req.body;

    if (!jobNumber || !partNumber || !status || !VALID_STAR_STATUSES.includes(status)) {
        return res.status(400).json({ error: 'Invalid parameters' });
    }

    try {
        const [rows] = await db.execute(
            `SELECT s.id FROM stars s
             JOIN job_part jp ON s.job_part_id = jp.id
             JOIN part p ON jp.part_id = p.id
             JOIN job j ON jp.job_id = j.id
             WHERE j.job_number = ? AND p.number = ?`,
            [jobNumber, partNumber]
        );

        if (!rows.length) {
            return res.status(404).json({ error: 'No starred part found for that job / part combination' });
        }

        await db.execute(
            `UPDATE stars SET status = ? WHERE id = ?`,
            [status, rows[0].id]
        );
        res.status(200).json({ message: 'Status updated successfully' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to update status' });
    }
});

// GET domain.com/api/internal/job/getstarredjobsfilteredbyclient
// Get starred job_part IDs filtered by client (attention) name. Reads: stars table.
router.get('/getstarredjobsfilteredbyclient', async (req, res) => {
    const { clientName } = req.query;

    if (!clientName) {
        return res.status(400).json({ error: 'Client Name is required' });
    }

    try {
        const [rows] = await db.execute(
            `SELECT job_part_id FROM stars WHERE attention = ?`,
            [clientName]
        );
        res.status(200).json(rows);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to fetch starred jobs for client' });
    }
});

// GET domain.com/api/internal/job/getstarredjobsfullbyclient
// Get full starred job details filtered by client (attention) name. Reads: stars, job_part, part, job, company tables.
router.get('/getstarredjobsfullbyclient', async (req, res) => {
    const { clientName } = req.query;

    if (!clientName) {
        return res.status(400).json({ error: 'Client Name is required' });
    }

    try {
        const [rows] = await db.execute(
            `SELECT
                s.job_part_id,
                s.status,
                s.attention,
                s.nfc_tag_id,
                jp.id AS job_part_id,
                jp.quantity,
                jp.price,
                jp.rev,
                jp.details,
                jp.note AS part_note,
                p.id AS part_id,
                p.number AS part_number,
                p.description AS part_description,
                j.id AS job_id,
                j.job_number,
                j.attention,
                j.po_number,
                j.po_date,
                j.due_date,
                j.invoice_number,
                j.created_at,
                c.name AS company_name
             FROM stars s
             JOIN job_part jp ON s.job_part_id = jp.id
             JOIN part p ON jp.part_id = p.id
             JOIN job j ON jp.job_id = j.id
             JOIN company c ON j.company_id = c.id
             WHERE s.attention = ?`,
            [clientName]
        );
        res.status(200).json(rows);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to fetch starred jobs for client' });
    }
});

// GET domain.com/api/internal/job/getstarredjobsfullbycompany
// Get full starred job details filtered by company ID. Reads: stars, job_part, part, job, company tables.
router.get('/getstarredjobsfullbycompany', async (req, res) => {
    const { companyId } = req.query;

    if (!companyId) {
        return res.status(400).json({ error: 'Company ID is required' });
    }

    try {
        const [rows] = await db.execute(
            `SELECT
                s.job_part_id,
                s.status,
                s.attention,
                s.nfc_tag_id,
                jp.id AS job_part_id,
                jp.quantity,
                jp.price,
                jp.rev,
                jp.details,
                jp.note AS part_note,
                p.id AS part_id,
                p.number AS part_number,
                p.description AS part_description,
                j.id AS job_id,
                j.job_number,
                j.attention,
                j.po_number,
                j.po_date,
                j.due_date,
                j.invoice_number,
                j.created_at,
                c.name AS company_name
             FROM stars s
             JOIN job_part jp ON s.job_part_id = jp.id
             JOIN part p ON jp.part_id = p.id
             JOIN job j ON jp.job_id = j.id
             JOIN company c ON j.company_id = c.id
             WHERE j.company_id = ?`,
            [companyId]
        );
        res.status(200).json(rows);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to fetch starred jobs for company' });
    }
});

// GET domain.com/api/internal/job/checkstarred
// Check whether a specific job_part ID is currently starred. Reads: stars table.
router.get('/checkstarred', async (req, res) => {
    const { jobPartId } = req.query;

    if (!jobPartId) {
        return res.status(400).json({ error: 'Job Part ID is required' });
    }

    try {
        const [rows] = await db.execute(
            `SELECT job_part_id FROM stars WHERE job_part_id = ?`,
            [jobPartId]
        );

        res.status(200).json({ 
            isStarred: rows.length > 0,
            jobPartId: jobPartId
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to check starred status' });
    }
});

// GET domain.com/api/internal/job/checkjobstarred
// Check whether any part within a given job is currently starred. Reads: stars, job_part tables.
router.get('/checkjobstarred', async (req, res) => {
    const { jobId } = req.query;

    if (!jobId) {
        return res.status(400).json({ error: 'Job ID is required' });
    }

    try {
        const [rows] = await db.execute(
            `SELECT s.id FROM stars s
             JOIN job_part jp ON s.job_part_id = jp.id
             WHERE jp.job_id = ?
             LIMIT 1`,
            [jobId]
        );

        res.status(200).json({ isStarred: rows.length > 0 });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to check job starred status' });
    }
});

module.exports = router;
