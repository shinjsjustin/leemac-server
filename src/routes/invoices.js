const express = require('express');
const router = express.Router();
const db = require('../db/db');

// Get all waiting invoices with pagination
router.get('/waiting', async (req, res) => {
    const limit = Number(req.query.limit) || 20;
    const offset = Number(req.query.offset) || 0;

    try {
        // Get total count for pagination info
        const [countRows] = await db.execute(
            `SELECT COUNT(*) as total FROM job 
             WHERE invoice_status = 'waiting' AND invoice_number IS NOT NULL`
        );
        const total = countRows[0].total;

        const [rows] = await db.execute(
            `SELECT job.id, job.job_number, job.company_id, job.po_number, 
                    job.invoice_number, job.attention, job.total_cost, 
                    job.invoice_date, job.created_at,
                    company.name AS company_name
             FROM job 
             JOIN company ON job.company_id = company.id
             WHERE job.invoice_status = 'waiting' 
               AND job.invoice_number IS NOT NULL
             ORDER BY job.invoice_date DESC
             LIMIT ${limit} OFFSET ${offset}`
        );

        res.status(200).json({
            invoices: rows,
            pagination: {
                total,
                limit,
                offset,
                hasMore: offset + limit < total
            }
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to fetch waiting invoices' });
    }
});

// Get waiting invoices by company ID with pagination
router.get('/waiting/company/:companyId', async (req, res) => {
    const { companyId } = req.params;
    const limit = Number(req.query.limit) || 20;
    const offset = Number(req.query.offset) || 0;

    if (!companyId) {
        return res.status(400).json({ error: 'Company ID is required' });
    }

    try {
        // Get total count for pagination info
        const [countRows] = await db.execute(
            `SELECT COUNT(*) as total FROM job 
             WHERE invoice_status = 'waiting' 
               AND company_id = ? 
               AND invoice_number IS NOT NULL`,
            [companyId]
        );
        const total = countRows[0].total;

        const [rows] = await db.execute(
            `SELECT job.id, job.job_number, job.company_id, job.po_number, 
                    job.invoice_number, job.attention, job.total_cost, 
                    job.invoice_date, job.created_at,
                    company.name AS company_name
             FROM job 
             JOIN company ON job.company_id = company.id
             WHERE job.invoice_status = 'waiting' 
               AND job.company_id = ?
               AND job.invoice_number IS NOT NULL
             ORDER BY job.invoice_date DESC
             LIMIT ${limit} OFFSET ${offset}`,
            [companyId]
        );

        res.status(200).json({
            invoices: rows,
            pagination: {
                total,
                limit,
                offset,
                hasMore: offset + limit < total
            }
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to fetch waiting invoices for company' });
    }
});

// Get all paid invoices with pagination
router.get('/paid', async (req, res) => {
    const limit = Number(req.query.limit) || 20;
    const offset = Number(req.query.offset) || 0;

    try {
        // Get total count for pagination info
        const [countRows] = await db.execute(
            `SELECT COUNT(*) as total FROM job 
             WHERE invoice_status = 'paid' AND invoice_number IS NOT NULL`
        );
        const total = countRows[0].total;

        const [rows] = await db.execute(
            `SELECT job.id, job.job_number, job.company_id, job.po_number, 
                    job.invoice_number, job.attention, job.total_cost, 
                    job.invoice_date, job.created_at,
                    company.name AS company_name
             FROM job 
             JOIN company ON job.company_id = company.id
             WHERE job.invoice_status = 'paid' 
               AND job.invoice_number IS NOT NULL
             ORDER BY job.invoice_date DESC
             LIMIT ${limit} OFFSET ${offset}`
        );

        res.status(200).json({
            invoices: rows,
            pagination: {
                total,
                limit,
                offset,
                hasMore: offset + limit < total
            }
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to fetch paid invoices' });
    }
});

// Update invoice status from waiting to paid
router.post('/markpaid', async (req, res) => {
    const { jobId } = req.body;

    if (!jobId) {
        return res.status(400).json({ error: 'Job ID is required' });
    }

    try {
        // First check if the job exists and is currently waiting
        const [checkRows] = await db.execute(
            `SELECT id, invoice_status, invoice_number FROM job WHERE id = ?`,
            [jobId]
        );

        if (checkRows.length === 0) {
            return res.status(404).json({ error: 'Job not found' });
        }

        if (!checkRows[0].invoice_number) {
            return res.status(400).json({ error: 'Job does not have an invoice number' });
        }

        if (checkRows[0].invoice_status === 'paid') {
            return res.status(400).json({ error: 'Invoice is already marked as paid' });
        }

        // Update the invoice status to paid
        await db.execute(
            `UPDATE job SET invoice_status = 'paid' WHERE id = ?`,
            [jobId]
        );

        res.status(200).json({ message: 'Invoice marked as paid successfully' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to update invoice status' });
    }
});

// Update invoice status back to waiting (in case of mistake)
router.post('/markwaiting', async (req, res) => {
    const { jobId } = req.body;

    if (!jobId) {
        return res.status(400).json({ error: 'Job ID is required' });
    }

    try {
        // First check if the job exists
        const [checkRows] = await db.execute(
            `SELECT id, invoice_status, invoice_number FROM job WHERE id = ?`,
            [jobId]
        );

        if (checkRows.length === 0) {
            return res.status(404).json({ error: 'Job not found' });
        }

        if (!checkRows[0].invoice_number) {
            return res.status(400).json({ error: 'Job does not have an invoice number' });
        }

        if (checkRows[0].invoice_status === 'waiting') {
            return res.status(400).json({ error: 'Invoice is already marked as waiting' });
        }

        // Update the invoice status to waiting
        await db.execute(
            `UPDATE job SET invoice_status = 'waiting' WHERE id = ?`,
            [jobId]
        );

        res.status(200).json({ message: 'Invoice marked as waiting successfully' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to update invoice status' });
    }
});

// Get invoice summary statistics
router.get('/summary', async (req, res) => {
    try {
        const [waitingRows] = await db.execute(
            `SELECT COUNT(*) as count, COALESCE(SUM(total_cost), 0) as total_amount
             FROM job 
             WHERE invoice_status = 'waiting' AND invoice_number IS NOT NULL`
        );

        const [paidRows] = await db.execute(
            `SELECT COUNT(*) as count, COALESCE(SUM(total_cost), 0) as total_amount
             FROM job 
             WHERE invoice_status = 'paid' AND invoice_number IS NOT NULL`
        );

        res.status(200).json({
            waiting: {
                count: waitingRows[0].count,
                total_amount: parseFloat(waitingRows[0].total_amount || 0)
            },
            paid: {
                count: paidRows[0].count,
                total_amount: parseFloat(paidRows[0].total_amount || 0)
            }
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to fetch invoice summary' });
    }
});

// Get invoice summary statistics by company
router.get('/summary/company/:companyId', async (req, res) => {
    const { companyId } = req.params;

    if (!companyId) {
        return res.status(400).json({ error: 'Company ID is required' });
    }

    try {
        const [waitingRows] = await db.execute(
            `SELECT COUNT(*) as count, COALESCE(SUM(total_cost), 0) as total_amount
             FROM job 
             WHERE invoice_status = 'waiting' 
               AND invoice_number IS NOT NULL 
               AND company_id = ?`,
            [companyId]
        );

        const [paidRows] = await db.execute(
            `SELECT COUNT(*) as count, COALESCE(SUM(total_cost), 0) as total_amount
             FROM job 
             WHERE invoice_status = 'paid' 
               AND invoice_number IS NOT NULL 
               AND company_id = ?`,
            [companyId]
        );

        res.status(200).json({
            waiting: {
                count: waitingRows[0].count,
                total_amount: parseFloat(waitingRows[0].total_amount || 0)
            },
            paid: {
                count: paidRows[0].count,
                total_amount: parseFloat(paidRows[0].total_amount || 0)
            }
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to fetch invoice summary for company' });
    }
});

module.exports = router;
