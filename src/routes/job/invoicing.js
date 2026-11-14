const express = require('express');
const router = express.Router();
const db = require('../../db/db');
const { requireAdmin } = require('../../middleware/requireRole');
const { isDuplicateInvoice } = require('../../lib/invoiceNumbers');
const { recordInvoiceClick } = require('../../lib/invoiceClick');
const { periodIdForDate } = require('../../lib/periodForDate');

// POST domain.com/api/internal/job/updateinvoiceandincrement
// Number a job that has no invoice number yet (keeps an existing one), record the click time and ship date,
// and link the job to the financial period of its invoice date.
// Affects: job, metadata, job_period tables.
router.post('/updateinvoiceandincrement', requireAdmin(3), async (req, res) => {
    const { jobId } = req.body;

    if (!jobId) return res.status(400).json({ error: 'Job ID is required' });

    try {
        const click = await recordInvoiceClick(db, jobId);
        if (!click) return res.status(404).json({ error: 'Job not found' });

        // Link a job that is in no period yet to the period holding its invoice date
        try {
            const [[job]] = await db.execute(`SELECT invoice_date FROM job WHERE id = ?`, [jobId]);
            const periodId = job.invoice_date ? await periodIdForDate(db, job.invoice_date) : null;
            if (periodId !== null) {
                const [linked] = await db.execute(`SELECT id FROM job_period WHERE job_id = ? LIMIT 1`, [jobId]);
                if (linked.length === 0) {
                    await db.execute(`INSERT INTO job_period (job_id, financial_period_id) VALUES (?, ?)`, [jobId, periodId]);
                }
            }
        } catch (periodError) {
            console.error('Warning: Failed to auto-assign job to financial period:', periodError);
            // Don't fail the invoice creation if period assignment fails
        }

        res.status(200).json({ message: 'Invoice updated and invoice number incremented successfully' });
    } catch (e) {
        if (isDuplicateInvoice(e)) return res.status(409).json({ error: 'Invoice number was just taken by another job; try again' });
        console.error(e);
        res.status(500).json({ error: 'Failed to update invoice and increment invoice number' });
    }
});

// POST domain.com/api/internal/job/calculatecost
// Calculate subtotal and total_cost (with tax) for a job from its parts and save the result. Affects: job table. Reads: job_part table.
router.post('/calculatecost', async (req, res) => {
    const { jobId } = req.body;

    if (!jobId) {
        return res.status(400).json({ error: 'Job ID is required' });
    }

    try {
        // Calculate the subtotal by summing up part.price * job_part.quantity
        const [subtotalRows] = await db.execute(
            `SELECT SUM(job_part.price * job_part.quantity) AS subtotal
             FROM job_part
             JOIN part ON job_part.part_id = part.id
             WHERE job_part.job_id = ?`,
            [jobId]
        );

        const subtotal = parseFloat(subtotalRows[0].subtotal || 0); // Ensure subtotal is a float

        // Fetch tax and tax_percent for the job
        const [jobRows] = await db.execute(
            `SELECT tax, tax_percent FROM job WHERE id = ?`,
            [jobId]
        );

        if (jobRows.length === 0) {
            return res.status(404).json({ error: 'Job not found' });
        }

        const { tax, tax_percent } = jobRows[0];
        let totalCost = subtotal;

        // Calculate total_cost based on tax or tax_percent
        if (tax > 0) {
            totalCost += parseFloat(tax); // Ensure tax is treated as a float
        } else if (tax_percent > 0) {
            totalCost += subtotal * (parseFloat(tax_percent)/100); // Ensure tax_percent is treated as a float
        }

        // Update the job with the calculated subtotal and total_cost
        await db.execute(
            `UPDATE job SET subtotal = ?, total_cost = ? WHERE id = ?`,
            [subtotal, totalCost, jobId]
        );

        res.status(200).json({ message: 'Cost calculated successfully', subtotal, total_cost: totalCost });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to calculate cost' });
    }
});

module.exports = router;
