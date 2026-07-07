const express = require('express');
const router = express.Router();
const db = require('../../db/db');

// POST domain.com/api/internal/job/updateinvoiceandincrement
// Assign the next invoice number to a job, update invoice/ship dates, increment the global counter,
// and auto-assign the job to the current financial period if one is set.
// Affects: job, metadata, job_period tables.
router.post('/updateinvoiceandincrement', async (req, res) => {
    const { jobId } = req.body;

    if (!jobId) return res.status(400).json({ error: 'Job ID is required' });

    try {
        // Fetch the current invoice number
        const [rows] = await db.execute(
            `SELECT metavalue FROM metadata WHERE metakey = 'current_invoice_num'`
        );

        if (rows.length === 0) return res.status(404).json({ error: 'Current invoice number not found' });

        const currentInvoiceNum = JSON.parse(rows[0].metavalue);
        const newInvoiceNum = currentInvoiceNum + 1;
        const now = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

        // Update the job with the new invoice number and dates
        await db.execute(
            `UPDATE job SET invoice_number = ?, invoice_date = ?, ship_date = ? WHERE id = ?`,
            [newInvoiceNum, now, now, jobId]
        );

        // Increment the current invoice number in metadata
        await db.execute(
            `REPLACE INTO metadata (metakey, metavalue) VALUES ('current_invoice_num', JSON_QUOTE(?))`,
            [String(newInvoiceNum)]
        );

        // Auto-assign job to current financial period if one is set
        try {
            const [periodRows] = await db.execute(
                `SELECT metavalue FROM metadata WHERE metakey = 'current_financial_period_id'`
            );

            if (periodRows.length > 0) {
                const currentPeriodId = JSON.parse(periodRows[0].metavalue);
                
                // Check if job is already assigned to this period
                const [existingAssignment] = await db.execute(
                    `SELECT id FROM job_period WHERE job_id = ? AND financial_period_id = ?`,
                    [jobId, currentPeriodId]
                );

                if (existingAssignment.length === 0) {
                    // Assign job to current financial period
                    await db.execute(
                        `INSERT INTO job_period (job_id, financial_period_id) VALUES (?, ?)`,
                        [jobId, currentPeriodId]
                    );
                    console.log(`Job ${jobId} automatically assigned to financial period ${currentPeriodId}`);
                }
            }
        } catch (periodError) {
            console.error('Warning: Failed to auto-assign job to financial period:', periodError);
            // Don't fail the invoice creation if period assignment fails
        }

        res.status(200).json({ message: 'Invoice updated and invoice number incremented successfully' });
    } catch (e) {
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
