const express = require('express');
const router = express.Router();
const db = require('../db/db');

// POST domain.com/api/internal/job/newjob
// Create a new job with job number, company ID, and attention field. Affects: job table.
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

// POST domain.com/api/internal/job/updatepo
// Update PO number, PO date, due date, tax code, tax, and tax percent for a job. Affects: job table.
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

// POST domain.com/api/internal/job/matchjobbyparts
// Find the job that fully matches a set of PO line items. Each line item is
// { part_number, quantity, price }. A match requires every line item to match a
// part on the SAME job (exact part number + quantity + price) AND that job to
// contain exactly that many parts (a complete, bidirectional match). Returns the
// single matching job, or matched:false when there is no unambiguous full match.
// Reads: job_part, part, job, company tables.
router.post('/matchjobbyparts', async (req, res) => {
    const { lineItems } = req.body || {};

    if (!Array.isArray(lineItems) || lineItems.length === 0) {
        return res.status(400).json({ error: 'lineItems must be a non-empty array' });
    }

    // Normalise and validate every line item before touching the database.
    const items = [];
    for (const li of lineItems) {
        const partNumber = li && li.part_number != null ? String(li.part_number).trim() : '';
        const quantity = Number(li && li.quantity);
        const price = Number(li && li.price);
        if (!partNumber || !Number.isFinite(quantity) || !Number.isFinite(price)) {
            return res.status(400).json({
                error: 'Each line item requires part_number, quantity, and price',
            });
        }
        items.push({ part_number: partNumber, quantity, price });
    }

    try {
        // Pull every job_part for the part numbers referenced in the PO.
        const partNumbers = [...new Set(items.map((i) => i.part_number))];
        const placeholders = partNumbers.map(() => '?').join(', ');
        const [rows] = await db.execute(
            `SELECT jp.job_id, jp.quantity, jp.price, p.number AS part_number
             FROM job_part jp
             JOIN part p ON jp.part_id = p.id
             WHERE p.number IN (${placeholders})`,
            partNumbers
        );

        // For each job, record which line-item indices it fully satisfies
        // (exact part number + quantity + price). Price is compared as a rounded
        // integer because job_part.price is stored as an integer.
        const matchedByJob = new Map(); // job_id -> Set(lineItemIndex)
        for (const row of rows) {
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                if (
                    row.part_number === item.part_number &&
                    Number(row.quantity) === item.quantity &&
                    Number(row.price) === Math.round(item.price)
                ) {
                    if (!matchedByJob.has(row.job_id)) matchedByJob.set(row.job_id, new Set());
                    matchedByJob.get(row.job_id).add(i);
                }
            }
        }

        // Candidate jobs satisfy every single line item.
        const candidateJobIds = [...matchedByJob.entries()]
            .filter(([, idxSet]) => idxSet.size === items.length)
            .map(([jobId]) => jobId);

        if (candidateJobIds.length === 0) {
            return res.status(200).json({
                matched: false,
                reason: 'No job matches every line item (part number, quantity, and price).',
                candidates: [],
            });
        }

        // Require a complete bidirectional match: the job must contain exactly as
        // many parts as the PO has line items (no extra, unmatched parts).
        const countPlaceholders = candidateJobIds.map(() => '?').join(', ');
        const [countRows] = await db.execute(
            `SELECT job_id, COUNT(*) AS part_count
             FROM job_part
             WHERE job_id IN (${countPlaceholders})
             GROUP BY job_id`,
            candidateJobIds
        );
        const fullMatchIds = countRows
            .filter((r) => Number(r.part_count) === items.length)
            .map((r) => r.job_id);

        if (fullMatchIds.length !== 1) {
            return res.status(200).json({
                matched: false,
                reason: fullMatchIds.length === 0
                    ? 'Line items matched a job only partially; no job is a complete match.'
                    : 'Multiple jobs fully match these line items; cannot disambiguate.',
                candidates: fullMatchIds,
            });
        }

        const [jobRows] = await db.execute(
            `SELECT job.id, job.job_number, job.company_id, company.name AS company_name,
                    job.attention, job.po_number, job.created_at
             FROM job
             JOIN company ON job.company_id = company.id
             WHERE job.id = ?`,
            [fullMatchIds[0]]
        );

        return res.status(200).json({ matched: true, job: jobRows[0] });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Server error when matching job by parts' });
    }
});


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

// GET domain.com/api/internal/job/getjobs
// Get a paginated, sortable list of all jobs with company name. Supports optional attention filter.
// Reads: job, company tables.
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

// GET domain.com/api/internal/job/jobsummary
// Get a full job summary including all job fields, company info, and linked parts with pricing.
// Reads: job, company, job_part, part tables.
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

// GET domain.com/api/internal/job/currentjobnum
// Get the current job number counter from the metadata store. Reads: metadata table.
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

// POST domain.com/api/internal/job/updatejobnum
// Update the current job number counter in the metadata store. Affects: metadata table.
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


// POST domain.com/api/internal/job/status
// Update the job status configuration JSON object in the metadata store. Affects: metadata table.
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

const VALID_STAR_STATUSES = [
    'open', 'urgent', 'waiting', 'done',
    'quoted', 'checking_stock', 'waiting_material', 'at_subvendor',
    'programming', 'setup', 'running_machine_a', 'running_machine_d',
    'running_manual', 'deburr_clean', 'qa', 'waiting_finish',
    'packing', 'delivered', 'invoiced',
];

// PUT domain.com/api/internal/job/pairnfctag
// Pair an NFC tag ID to a starred job_part for scan-based status updates. Affects: stars table.
router.put('/pairnfctag', async (req, res) => {
    const { jobPartId, nfcTagId } = req.body;
    if (!jobPartId || !nfcTagId) {
        return res.status(400).json({ error: 'jobPartId and nfcTagId are required' });
    }
    try {
        await db.execute(
            `UPDATE stars SET nfc_tag_id = ? WHERE job_part_id = ?`,
            [nfcTagId, jobPartId]
        );
        res.status(200).json({ message: 'NFC tag paired successfully' });
    } catch (e) {
        if (e.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'This NFC tag is already paired to another part.' });
        }
        console.error(e);
        res.status(500).json({ error: 'Failed to pair NFC tag' });
    }
});

// PUT domain.com/api/internal/job/unpairnfctag
// Clear the NFC tag association from a starred job_part. Affects: stars table.
router.put('/unpairnfctag', async (req, res) => {
    const { jobPartId } = req.body;
    if (!jobPartId) {
        return res.status(400).json({ error: 'jobPartId is required' });
    }
    try {
        await db.execute(
            `UPDATE stars SET nfc_tag_id = NULL WHERE job_part_id = ?`,
            [jobPartId]
        );
        res.status(200).json({ message: 'NFC tag disconnected' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to disconnect NFC tag' });
    }
});

// PUT domain.com/api/internal/job/updatestarstatusbynfctag
// Update the production status of a starred job_part identified by its NFC tag. Affects: stars table.
router.put('/updatestarstatusbynfctag', async (req, res) => {
    const { nfcTagId, status } = req.body;
    if (!nfcTagId || !status || !VALID_STAR_STATUSES.includes(status)) {
        return res.status(400).json({ error: 'Invalid parameters' });
    }
    try {
        const [rows] = await db.execute(
            `SELECT id FROM stars WHERE nfc_tag_id = ?`,
            [nfcTagId]
        );
        if (!rows.length) {
            return res.status(404).json({ error: 'No starred part found for this NFC tag' });
        }
        await db.execute(
            `UPDATE stars SET status = ? WHERE nfc_tag_id = ?`,
            [status, nfcTagId]
        );
        res.status(200).json({ message: 'Status updated via NFC tag' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to update status' });
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

// POST domain.com/api/internal/job/getjobsbypartids
// Get full job and part details for a list of job_part IDs. Reads: job_part, part, job, company tables.
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

// GET domain.com/api/internal/job/getjobsbyclient
// Get a paginated list of jobs for a client (attention) name, each with associated parts. Reads: job, job_part, part tables.
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

// GET domain.com/api/internal/job/getjobsbycompany
// Get a paginated list of jobs filtered by company ID, each with associated parts. Reads: job, job_part, part tables.
router.get('/getjobsbycompany', async (req, res) => {
    const { companyId } = req.query;

    if (!companyId) {
        return res.status(400).json({ error: 'Company ID is required' });
    }

    const limit = Number(req.query.limit) || 20;
    const offset = Number(req.query.offset) || 0;

    try {
        const [countRows] = await db.execute(
            `SELECT COUNT(*) as total FROM job WHERE company_id = ?`,
            [companyId]
        );
        const total = countRows[0].total;

        const query = `
            SELECT job.id, job.job_number, job.attention, job.created_at, job.po_number, job.po_date, job.invoice_number
            FROM job
            WHERE job.company_id = ?
            ORDER BY job.created_at DESC
            LIMIT ${limit} OFFSET ${offset}
        `;

        const [jobRows] = await db.execute(query, [companyId]);

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
        res.status(500).json({ error: 'Failed to fetch jobs for company' });
    }
});

module.exports = router;