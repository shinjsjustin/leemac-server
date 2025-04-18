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
        let query = `UPDATE job SET po_number = ?, po_date = ?, due_date = ?, tax_code = ?`;
        const params = [poNum, poDate, dueDate, taxCode];

        if (tax > 0) {
            query += `, tax = ?`;
            params.push(tax);
        }

        if (taxPercent > 0) {
            query += `, tax_percent = ?`;
            params.push(taxPercent);
        }

        query += ` WHERE id = ?`;
        params.push(jobId);

        await db.execute(query, params);
        res.status(200).json({ message: 'PO info updated successfully' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Server error when updating PO info' });
    }
});

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

        res.status(200).json({ message: 'Invoice updated and invoice number incremented successfully' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to update invoice and increment invoice number' });
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

router.post('/updatequantity', async (req, res) => {
    const { jobId, partId, quantity } = req.body;

    if (!jobId || !partId || quantity === undefined) {
        return res.status(400).json({ error: 'Job ID, Part ID, and Quantity are required' });
    }

    try {
        await db.execute(
            `UPDATE job_part SET quantity = ? WHERE job_id = ? AND part_id = ?`,
            [quantity, jobId, partId]
        );
        res.status(200).json({ message: 'Quantity updated successfully' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to update quantity' });
    }
});

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

router.get('/getjobs', async (req, res) => {
    const { sortBy = 'created_at', order = 'desc' } = req.query;

    const validSorts = ['created_at', 'po_date', 'attention', 'job_number', 'po_number', 'invoice_number', 'company_name'];
    if (!validSorts.includes(sortBy)) {
        return res.status(400).json({ error: 'Invalid sort column' });
    }

    try {
        const [rows] = await db.execute(
            `SELECT job.id, job.job_number, company.name AS company_name, job.attention, job.created_at, job.po_number, job.po_date, job.invoice_number
             FROM job
             JOIN company ON job.company_id = company.id
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
        const [jobRows] = await db.execute(
            `SELECT job.attention, job.job_number, job.po_number, job.po_date, job.created_at, 
                    job.due_date, job.tax_code, job.tax, job.tax_percent, job.invoice_number, 
                    job.invoice_date, job.total_cost, job.subtotal, company.name AS company_name, company.code AS company_code, 
                    company.address_line1, company.address_line2
             FROM job
             JOIN company ON job.company_id = company.id
             WHERE job.id = ?`,
            [id]
        );

        if (jobRows.length === 0) {
            return res.status(404).json({ error: 'Job not found' });
        }

        const [parts] = await db.execute(
            `SELECT part.id, part.number, part.price, part.rev, part.details, part.description, job_part.quantity
             FROM job_part
             JOIN part ON job_part.part_id = part.id
             WHERE job_part.job_id = ?`,
            [id]
        );

        res.status(200).json({
            job: jobRows[0],
            parts: parts, 
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

router.post('/starjob', async (req, res) => {
    const { jobId } = req.body;

    if (!jobId) {
        return res.status(400).json({ error: 'Job ID is required' });
    }

    try {
        await db.execute(
            `INSERT INTO stars (job_id) VALUES (?)`,
            [jobId]
        );
        res.status(201).json({ message: 'Job starred successfully' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to star job' });
    }
});

router.delete('/unstarjob', async (req, res) => {
    const { jobId } = req.body;

    if (!jobId) {
        return res.status(400).json({ error: 'Job ID is required' });
    }

    try {
        await db.execute(
            `DELETE FROM stars WHERE job_id = ?`,
            [jobId]
        );
        res.status(200).json({ message: 'Job unstarred successfully' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to unstar job' });
    }
});

router.get('/getstarredjobs', async (req, res) => {
    try {
        const [rows] = await db.execute(
            `SELECT job_id FROM stars`
        );
        res.status(200).json(rows);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to fetch starred jobs' });
    }
});

router.post('/getjobsbyids', async (req, res) => {
    const { jobIds } = req.body;

    if (!Array.isArray(jobIds) || jobIds.length === 0) {
        return res.status(400).json({ error: 'jobIds must be a non-empty array' });
    }

    // console.log('Received jobIds:', jobIds); // Log the received jobIds

    try {
        // Extract job_id values from the array of objects
        const jobIdValues = jobIds.map(job => job.job_id);
        console.log('Extracted job_id values:', jobIdValues); // Log the extracted job IDs

        const placeholders = jobIdValues.map(() => '?').join(', ');
        const query = `
            SELECT job.id, job.job_number, company.name AS company_name, job.attention, job.created_at, job.po_number, job.po_date, job.invoice_number
            FROM job
            JOIN company ON job.company_id = company.id
            WHERE job.id IN (${placeholders})
        `;
        // console.log('Executing query:', query); // Log the query for debugging
        const [rows] = await db.execute(
            query,
            jobIdValues
        );

        // console.log('Database query result:', rows); // Log the query result

        res.status(200).json(rows);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to fetch jobs by IDs' });
    }
});

router.post('/calculatecost', async (req, res) => {
    const { jobId } = req.body;

    if (!jobId) {
        return res.status(400).json({ error: 'Job ID is required' });
    }

    try {
        // Calculate the subtotal by summing up part.price * job_part.quantity
        const [subtotalRows] = await db.execute(
            `SELECT SUM(part.price * job_part.quantity) AS subtotal
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