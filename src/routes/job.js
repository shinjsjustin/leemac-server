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
    const { sortBy = 'created_at', order = 'desc', attention = '' } = req.query;

    const validSorts = ['created_at', 'po_date', 'attention', 'job_number', 'po_number', 'invoice_number', 'company_name'];
    if (!validSorts.includes(sortBy)) {
        return res.status(400).json({ error: 'Invalid sort column' });
    }

    const orderDirection = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    const limit = Number(req.query.limit) || 20;
    const offset = Number(req.query.offset) || 0;
    const attentionFilter = attention.trim();

    try {
        const whereClause = attentionFilter ? `WHERE job.attention LIKE ?` : '';
        const params = attentionFilter ? [`%${attentionFilter}%`] : [];

        const [countRows] = await db.execute(
            `SELECT COUNT(*) as total FROM job ${attentionFilter ? 'WHERE attention LIKE ?' : ''}`,
            attentionFilter ? [`%${attentionFilter}%`] : []
        );
        const total = countRows[0].total;

        const query = `
            SELECT job.id, job.job_number, company.name AS company_name, job.attention, job.created_at, job.po_number, job.po_date, job.invoice_number
            FROM job
            JOIN company ON job.company_id = company.id
            ${whereClause}
            ORDER BY ${sortBy} ${orderDirection}
            LIMIT ${limit} OFFSET ${offset}
        `;

        const [rows] = await db.execute(query, [...params]);

        res.status(200).json({
            jobs: rows,
            pagination: {
                total,
                limit,
                offset,
                hasMore: offset + limit < total
            }
        });
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
            `SELECT part.id, part.number, job_part.id as job_part_id, job_part.price, job_part.rev, job_part.details, job_part.note, part.description, job_part.quantity
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

router.delete('/unstarjob', async (req, res) => {
    const { jobPartId } = req.body;

    if (!jobPartId) {
        return res.status(400).json({ error: 'Job Part ID is required' });
    }

    try {
        // Delete all tasks associated with this job part
        await db.execute(
            `DELETE FROM tasks WHERE job_part_id = ?`,
            [jobPartId]
        );

        // Remove the job part from stars
        await db.execute(
            `DELETE FROM stars WHERE job_part_id = ?`,
            [jobPartId]
        );

        res.status(200).json({ 
            message: 'Job part unstarred and associated tasks deleted successfully'
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to unstar job part and delete tasks' });
    }
});

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

router.get('/getstarredjobsfull', async (req, res) => {
    try {
        const [rows] = await db.execute(
            `SELECT
                s.job_part_id,
                s.status,
                s.attention,
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

router.put('/updatestarjobstatus', async (req, res) => {
    const { jobPartId, status } = req.body;
    const validStatuses = ['open', 'urgent', 'waiting', 'done'];

    if (!jobPartId || !status || !validStatuses.includes(status)) {
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

router.post('/getjobsbypartids', async (req, res) => {
    const { jobPartIds } = req.body;

    if (!Array.isArray(jobPartIds) || jobPartIds.length === 0) {
        return res.status(400).json({ error: 'jobPartIds must be a non-empty array' });
    }

    try {
        const idValues = jobPartIds.map(item => item.job_part_id ?? item);

        const placeholders = idValues.map(() => '?').join(', ');
        const query = `
            SELECT
                job_part.id AS job_part_id,
                job_part.quantity,
                job_part.price,
                job_part.rev,
                job_part.details,
                job_part.note AS part_note,
                part.id AS part_id,
                part.number AS part_number,
                part.description AS part_description,
                job.id AS job_id,
                job.job_number,
                job.attention,
                job.po_number,
                job.po_date,
                job.due_date,
                job.invoice_number,
                job.created_at,
                company.name AS company_name
            FROM job_part
            JOIN part ON job_part.part_id = part.id
            JOIN job ON job_part.job_id = job.id
            JOIN company ON job.company_id = company.id
            WHERE job_part.id IN (${placeholders})
        `;
        const [rows] = await db.execute(query, idValues);

        res.status(200).json(rows);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to fetch job parts by IDs' });
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

router.get('/getjobsbyclient', async (req, res) => {
    const { clientName } = req.query;

    if (!clientName) {
        return res.status(400).json({ error: 'Client name is required' });
    }

    const limit = Number(req.query.limit) || 20;
    const offset = Number(req.query.offset) || 0;

    try {
        // Get total count for pagination info
        const [countRows] = await db.execute(
            `SELECT COUNT(*) as total FROM job WHERE attention = ?`,
            [clientName]
        );
        const total = countRows[0].total;

        // Get jobs for the client
        const query = `
            SELECT job.id, job.job_number, job.attention, job.created_at, job.po_number, job.po_date, job.invoice_number
            FROM job
            WHERE job.attention = ?
            ORDER BY job.created_at DESC
            LIMIT ${limit} OFFSET ${offset}
        `;

        const [jobRows] = await db.execute(query, [clientName]);

        // For each job, get the associated parts
        const jobsWithParts = await Promise.all(
            jobRows.map(async (job) => {
                const [partRows] = await db.execute(
                    `SELECT p.number, jp.quantity, jp.price
                     FROM job_part jp
                     JOIN part p ON jp.part_id = p.id
                     WHERE jp.job_id = ?`,
                    [job.id]
                );
                
                return {
                    ...job,
                    parts: partRows
                };
            })
        );

        res.status(200).json({
            jobs: jobsWithParts,
            pagination: {
                total,
                limit,
                offset,
                hasMore: offset + limit < total
            }
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to fetch jobs for client' });
    }
});

module.exports = router;