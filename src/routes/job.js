const express = require('express');
const router = express.Router();
const db = require('../db/db');

router.post('/newjob', async (req, res) => {
    const { jobNum, companyId, attention } = req.body;

    if (!jobNum || !companyId) {
        return res.status(400).json({ error: 'Missing job number or company ID' });
    }

    try {
        const [result] = await db.execute(
            `INSERT INTO job (job_number, company_id, attention) VALUES (?, ?, ?)`,
            [jobNum, companyId, attention]  // Job number placeholder
        );
        res.status(201).json({ id: result.insertId });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Server error when creating new job' });
    }
});

router.post('/updatepo', async (req, res) => {
    const { jobId, poNum, poDate, dueDate, taxCode, tax, taxPercent } = req.body;

    try {
        await db.execute(
            `UPDATE job SET po_number = ?, po_date = ?, due_date = ?, tax_code = ?, tax = ?, tax_percent = ? WHERE id = ?`,
            [poNum, poDate, dueDate, taxCode, tax, taxPercent, jobId]
        );
        res.status(200).json({ message: 'PO info updated successfully' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Server error when updating PO info' });
    }
});

router.post('/updateinvoice', async (req, res) => {
    const { jobId, invoiceNum } = req.body;
    const now = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    try {
        await db.execute(
            `UPDATE job SET invoice_number = ?, invoice_date = ?, ship_date = ? WHERE id = ?`,
            [invoiceNum, now, now, jobId]
        );
        res.status(200).json({ message: 'Invoice info updated successfully' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Server error when updating invoice info' });
    }
});

router.post('/jobpartjoin', async (req, res) => {
    const { jobId, partId, quantity} = req.body;

    try {
        const [result] = await db.execute(
            `INSERT INTO job_part (job_id, part_id, quantity) VALUES (?, ?, ?)`,
            [jobId, partId, quantity]
        );
        res.status(201).json({ id: result.insertId });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Server error when linking part to job' });
    }
});

router.get('/getjobs', async (req, res) => {
    const { sortBy = 'created_at', order = 'desc' } = req.query;

    const validSorts = ['created_at', 'po_date', 'attention', 'job_number', 'po_number', 'invoice_number', 'company_id'];
    if (!validSorts.includes(sortBy)) {
        return res.status(400).json({ error: 'Invalid sort column' });
    }

    try {
        const [rows] = await db.execute(
            `SELECT id, job_number, company_id, created_at, po_number, po_date, invoice_number
             FROM job
             ORDER BY ${sortBy} ${order.toUpperCase()}`
        );
        res.status(200).json(rows);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to fetch jobs' });
    }
});

router.get('/jobsummary', async (req, res) => {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'Missing job ID' });

    try {
        // Get job summary with company
        const [jobRows] = await db.execute(
            `SELECT job.attention, job.job_number, job.po_number, job.po_date, job.created_at, company.name AS company_name
             FROM job
             JOIN company ON job.company_id = company.id
             WHERE job.id = ?`,
            [id]
        );

        if (jobRows.length === 0) {
            return res.status(404).json({ error: 'Job not found' });
        }

        // Get parts associated with job
        const [parts] = await db.execute(
            `SELECT part.id, part.number, part.price, job_part.quantity
             FROM job_part
             JOIN part ON job_part.part_id = part.id
             WHERE job_part.job_id = ?`,
            [id]
        );

        res.status(200).json({
            job: jobRows[0],
            parts
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Error fetching job summary' });
    }
});


router.get('/currentjobnum', async (req, res) => {
    try {
        const [rows] = await db.execute(
            `SELECT metavalue FROM metadata WHERE metakey = 'current_job_num'`
        );

        if (rows.length === 0) return res.status(404).json({ error: 'Job number not found' });

        res.status(200).json({ current_job_num: JSON.parse(rows[0].metavalue) });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to retrieve current job number' });
    }
});

router.get('/currentinvoicenum', async (req, res) => {
    try {
        const [rows] = await db.execute(
            `SELECT metavalue FROM metadata WHERE metakey = 'current_invoice_num'`
        );

        if (rows.length === 0) return res.status(404).json({ error: 'Invoice number not found' });

        res.status(200).json({ current_invoice_num: JSON.parse(rows[0].metavalue) });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to retrieve current invoice number' });
    }
});

router.post('/updatejobnum', async (req, res) => {
    const { number } = req.body;

    if (!number) return res.status(400).json({ error: 'Job number is required' });

    try {
        await db.execute(
            `REPLACE INTO metadata (metakey, metavalue) VALUES ('current_job_num', JSON_QUOTE(?))`,
            [String(number)]
        );
        res.status(200).json({ message: 'Job number updated' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to update job number' });
    }
});

router.post('/updateinvoicenum', async (req, res) => {
    const { number } = req.body;

    if (!number) return res.status(400).json({ error: 'Invoice number is required' });

    try {
        await db.execute(
            `REPLACE INTO metadata (metakey, metavalue) VALUES ('current_invoice_num', JSON_QUOTE(?))`,
            [String(number)]
        );
        res.status(200).json({ message: 'Invoice number updated' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to update invoice number' });
    }
});

router.get('/status', async (req, res) => {
    try {
        const [rows] = await db.execute(
            `SELECT metavalue FROM metadata WHERE metakey = 'job_status'`
        );

        if (rows.length === 0) return res.status(404).json({ error: 'Job status not found' });

        res.status(200).json({ job_status: JSON.parse(rows[0].metavalue) });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to retrieve job status' });
    }
});

router.post('/status', async (req, res) => {
    const { job_status } = req.body;

    if (!job_status || typeof job_status !== 'object') {
        return res.status(400).json({ error: 'job_status must be a valid JSON object' });
    }

    try {
        await db.execute(
            `REPLACE INTO metadata (metakey, metavalue) VALUES ('job_status', ?)`,
            [JSON.stringify(job_status)]
        );
        res.status(200).json({ message: 'Job status updated' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to update job status' });
    }
});


module.exports = router;