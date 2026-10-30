const express = require('express');
const router = express.Router();
const db = require('../../db/db');
const { createQuoteJob, QuoteJobError } = require('../../lib/quoteJob');
const { updateJobPo } = require('../../lib/jobPo');
const { loadJobSummary } = require('../../lib/jobSummary');
const { invoiceNumberOwner, isDuplicateInvoice } = require('../../lib/invoiceNumbers');

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

// POST domain.com/api/internal/job/createquotejob
// Auto-create a quote job from an RFQ: allocates the next job number from the
// metadata counter, inserts the job, reuses-or-creates each part, and links each
// part to the job. Logic lives in src/lib/quoteJob.js.
// Affects: metadata, job, part, job_part tables.
router.post('/createquotejob', async (req, res) => {
    try {
        res.status(201).json(await createQuoteJob(db, req.body));
    } catch (e) {
        if (e instanceof QuoteJobError) {
            return res.status(e.status).json({ error: e.message });
        }
        console.error(e);
        res.status(500).json({ error: 'Server error when creating quote job' });
    }
});

// POST domain.com/api/internal/job/updatepo
// Update PO number, PO date, due date, tax code, tax, and tax percent for a job. Affects: job table.
router.post('/updatepo', async (req, res) => {
    const { jobId, poNum, poDate, dueDate, taxCode, tax, taxPercent } = req.body;

    try {
        await updateJobPo(db, jobId, {
            po_number: poNum, po_date: poDate, due_date: dueDate, tax_code: taxCode, tax, tax_percent: taxPercent,
        });
        res.status(200).json({ message: 'PO info updated successfully' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Server error when updating PO info' });
    }
});

// POST domain.com/api/internal/job/updatedetails
// Update editable job header fields (attention, company assignment, created date, PO,
// tax, and invoice fields). Only keys present in the request body are updated.
// Affects: job table.
router.post('/updatedetails', async (req, res) => {
    const { jobId } = req.body;

    if (!jobId) return res.status(400).json({ error: 'Missing job ID' });

    // Whitelist of request body keys mapped to their job table columns. Column names
    // come only from this fixed map (never from user input), so the dynamic SET clause
    // below is safe from SQL injection.
    const fieldMap = {
        attention: 'attention',
        companyId: 'company_id',
        createdAt: 'created_at',
        poNum: 'po_number',
        poDate: 'po_date',
        dueDate: 'due_date',
        taxCode: 'tax_code',
        tax: 'tax',
        taxPercent: 'tax_percent',
        invoiceNumber: 'invoice_number',
        invoiceDate: 'invoice_date',
    };

    const setClauses = [];
    const params = [];

    for (const [bodyKey, column] of Object.entries(fieldMap)) {
        if (Object.prototype.hasOwnProperty.call(req.body, bodyKey)) {
            const raw = req.body[bodyKey];
            setClauses.push(`${column} = ?`);
            // The invoice number is saved trimmed so the unique index sees what the guard checked.
            const value = bodyKey === 'invoiceNumber' && typeof raw === 'string' ? raw.trim() : raw;
            params.push(value === '' ? null : value);
        }
    }

    const invoiceNumber = typeof req.body.invoiceNumber === 'string' ? req.body.invoiceNumber.trim() : '';

    if (setClauses.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
    }

    params.push(jobId);

    try {
        if (invoiceNumber) {
            const owner = await invoiceNumberOwner(db, invoiceNumber, jobId);
            if (owner !== null) return res.status(409).json({ error: `Invoice number ${invoiceNumber} is already used by job ${owner}` });
        }
        const [result] = await db.execute(
            `UPDATE job SET ${setClauses.join(', ')} WHERE id = ?`,
            params
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Job not found' });
        }
        res.status(200).json({ message: 'Job details updated successfully' });
    } catch (e) {
        if (isDuplicateInvoice(e)) return res.status(409).json({ error: `Invoice number ${invoiceNumber} is already used by another job` });
        console.error(e);
        res.status(500).json({ error: 'Server error when updating job details' });
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
        const summary = await loadJobSummary(db, id);
        if (!summary) return res.status(404).json({ error: 'Job not found' });

        res.status(200).json(summary);
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

module.exports = router;
