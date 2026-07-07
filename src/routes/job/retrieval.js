const express = require('express');
const router = express.Router();
const db = require('../../db/db');

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

        // Fetch all parts for the returned jobs in a single query
        let jobsWithParts;
        if (jobRows.length === 0) {
            jobsWithParts = [];
        } else {
            const jobIds = jobRows.map(j => j.id);
            const placeholders = jobIds.map(() => '?').join(', ');
            const [allParts] = await db.execute(
                `SELECT jp.job_id, p.number, jp.quantity, jp.price
                 FROM job_part jp
                 JOIN part p ON jp.part_id = p.id
                 WHERE jp.job_id IN (${placeholders})`,
                jobIds
            );

            const partsByJobId = {};
            for (const part of allParts) {
                if (!partsByJobId[part.job_id]) partsByJobId[part.job_id] = [];
                partsByJobId[part.job_id].push({ number: part.number, quantity: part.quantity, price: part.price });
            }

            jobsWithParts = jobRows.map(job => ({
                ...job,
                parts: partsByJobId[job.id] || []
            }));
        }

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

        // Fetch all parts for the returned jobs in a single query
        let jobsWithParts;
        if (jobRows.length === 0) {
            jobsWithParts = [];
        } else {
            const jobIds = jobRows.map(j => j.id);
            const placeholders = jobIds.map(() => '?').join(', ');
            const [allParts] = await db.execute(
                `SELECT jp.job_id, p.number, jp.quantity, jp.price
                 FROM job_part jp
                 JOIN part p ON jp.part_id = p.id
                 WHERE jp.job_id IN (${placeholders})`,
                jobIds
            );

            const partsByJobId = {};
            for (const part of allParts) {
                if (!partsByJobId[part.job_id]) partsByJobId[part.job_id] = [];
                partsByJobId[part.job_id].push({ number: part.number, quantity: part.quantity, price: part.price });
            }

            jobsWithParts = jobRows.map(job => ({
                ...job,
                parts: partsByJobId[job.id] || []
            }));
        }

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
