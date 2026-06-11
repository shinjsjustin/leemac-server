const express = require('express');
const router = express.Router();
const db = require('../db/db');

// ─── Financial Period CRUD ────────────────────────────────────────────────────

// GET domain.com/api/internal/finances/periods
// Retrieve all financial periods ordered by year and quarter descending. Reads: financial_period table.
router.get('/periods', async (req, res) => {
    try {
        const [rows] = await db.execute(
            `SELECT * FROM financial_period ORDER BY year DESC, quarter DESC`
        );
        res.status(200).json({ periods: rows });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to fetch financial periods' });
    }
});

// GET domain.com/api/internal/finances/periods/:id
// Retrieve a single financial period by its ID. Reads: financial_period table.
router.get('/periods/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const [rows] = await db.execute(
            `SELECT * FROM financial_period WHERE id = ?`,
            [id]
        );
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Financial period not found' });
        }
        res.status(200).json({ period: rows[0] });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to fetch financial period' });
    }
});

// POST domain.com/api/internal/finances/periods
// Create a new financial period with label, quarter, year, start_date, and end_date. Affects: financial_period table.
router.post('/periods', async (req, res) => {
    const { lable, quarter, year, start_date, end_date } = req.body;

    if (!lable || !quarter || !year || !start_date || !end_date) {
        return res.status(400).json({ error: 'lable, quarter, year, start_date, and end_date are required' });
    }

    if (quarter < 1 || quarter > 4) {
        return res.status(400).json({ error: 'Quarter must be between 1 and 4' });
    }

    try {
        const [result] = await db.execute(
            `INSERT INTO financial_period (lable, quarter, year, start_date, end_date) VALUES (?, ?, ?, ?, ?)`,
            [lable, quarter, year, start_date, end_date]
        );
        const [newPeriod] = await db.execute(
            `SELECT * FROM financial_period WHERE id = ?`,
            [result.insertId]
        );
        res.status(201).json({ period: newPeriod[0] });
    } catch (e) {
        if (e.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: `A financial period for Q${quarter} ${year} already exists` });
        }
        console.error(e);
        res.status(500).json({ error: 'Failed to create financial period' });
    }
});

// PUT domain.com/api/internal/finances/periods/:id
// Update an existing financial period by ID. Affects: financial_period table.
router.put('/periods/:id', async (req, res) => {
    const { id } = req.params;
    const { lable, quarter, year, start_date, end_date } = req.body;

    if (!lable || !quarter || !year || !start_date || !end_date) {
        return res.status(400).json({ error: 'lable, quarter, year, start_date, and end_date are required' });
    }

    if (quarter < 1 || quarter > 4) {
        return res.status(400).json({ error: 'Quarter must be between 1 and 4' });
    }

    try {
        const [check] = await db.execute(`SELECT id FROM financial_period WHERE id = ?`, [id]);
        if (check.length === 0) {
            return res.status(404).json({ error: 'Financial period not found' });
        }

        await db.execute(
            `UPDATE financial_period SET lable = ?, quarter = ?, year = ?, start_date = ?, end_date = ? WHERE id = ?`,
            [lable, quarter, year, start_date, end_date, id]
        );

        const [updated] = await db.execute(`SELECT * FROM financial_period WHERE id = ?`, [id]);
        res.status(200).json({ period: updated[0] });
    } catch (e) {
        if (e.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: `A financial period for Q${quarter} ${year} already exists` });
        }
        console.error(e);
        res.status(500).json({ error: 'Failed to update financial period' });
    }
});

// DELETE domain.com/api/internal/finances/periods/:id
// Delete a financial period by ID. Affects: financial_period table.
router.delete('/periods/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const [check] = await db.execute(`SELECT id FROM financial_period WHERE id = ?`, [id]);
        if (check.length === 0) {
            return res.status(404).json({ error: 'Financial period not found' });
        }

        await db.execute(`DELETE FROM financial_period WHERE id = ?`, [id]);
        res.status(200).json({ message: 'Financial period deleted successfully' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to delete financial period' });
    }
});

// GET domain.com/api/internal/finances/currentfinancialperiod
// Get the current active financial period ID from the metadata store. Reads: metadata table.
router.get('/currentfinancialperiod', async (req, res) => {
    try {
        const [rows] = await db.execute(
            `SELECT metavalue FROM metadata WHERE metakey = 'current_financial_period_id'`
        );

        if (rows.length === 0) return res.status(404).json({ error: 'Current financial period not found' });

        res.status(200).json({ current_financial_period_id: JSON.parse(rows[0].metavalue) });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to retrieve current financial period' });
    }
});

// POST domain.com/api/internal/finances/updatefinancialperiod
// Set the current active financial period ID in the metadata store. Affects: metadata table.
router.post('/updatefinancialperiod', async (req, res) => {
    const { periodId } = req.body;

    if (!periodId) return res.status(400).json({ error: 'Financial period ID is required' });

    try {
        // Verify the financial period exists
        const [periodCheck] = await db.execute(
            `SELECT id FROM financial_period WHERE id = ?`,
            [periodId]
        );

        if (periodCheck.length === 0) {
            return res.status(404).json({ error: 'Financial period not found' });
        }

        await db.execute(
            `REPLACE INTO metadata (metakey, metavalue) VALUES ('current_financial_period_id', JSON_QUOTE(?))`,
            [String(periodId)]
        );
        res.status(200).json({ message: 'Current financial period updated' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to update current financial period' });
    }
});

// ─── Job-Period Associations ──────────────────────────────────────────────────

// GET domain.com/api/internal/finances/periods/:id/invoices
// Get all jobs (invoices) assigned to a financial period with pagination and expense totals.
// Reads: job_period, job, company, expense_job, expense tables.
router.get('/periods/:id/invoices', async (req, res) => {
    const { id } = req.params;
    const limit = Number(req.query.limit) || 20;
    const offset = Number(req.query.offset) || 0;

    try {
        const [periodCheck] = await db.execute(`SELECT id FROM financial_period WHERE id = ?`, [id]);
        if (periodCheck.length === 0) {
            return res.status(404).json({ error: 'Financial period not found' });
        }

        const [countRows] = await db.execute(
            `SELECT COUNT(*) as total FROM job_period WHERE financial_period_id = ?`,
            [id]
        );
        const total = countRows[0].total;

        const [rows] = await db.execute(
            `SELECT job.id, job.job_number, job.company_id, job.po_number,
                    job.invoice_number, job.attention, job.total_cost,
                    job.invoice_date, job.invoice_status, job.created_at,
                    company.name AS company_name,
                    COALESCE(expense_totals.total_expenses, 0) AS total_expenses
             FROM job_period
             JOIN job ON job_period.job_id = job.id
             JOIN company ON job.company_id = company.id
             LEFT JOIN (
                 SELECT ej.job_id, SUM(e.amount) AS total_expenses
                 FROM expense_job ej
                 JOIN expense e ON ej.expense_id = e.id
                 GROUP BY ej.job_id
             ) AS expense_totals ON job.id = expense_totals.job_id
             WHERE job_period.financial_period_id = ?
             ORDER BY job.invoice_date DESC
             LIMIT ${limit} OFFSET ${offset}`,
            [id]
        );

        res.status(200).json({
            invoices: rows,
            pagination: { total, limit, offset, hasMore: offset + limit < total }
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to fetch invoices for period' });
    }
});

// GET domain.com/api/internal/finances/periods/:id/summary
// Get a financial period's invoice counts/totals by status (waiting/paid) plus total expenses.
// Reads: financial_period, job_period, job, expense, expense_job, expense_financial_period tables.
router.get('/periods/:id/summary', async (req, res) => {
    const { id } = req.params;

    try {
        const [periodRows] = await db.execute(`SELECT * FROM financial_period WHERE id = ?`, [id]);
        if (periodRows.length === 0) {
            return res.status(404).json({ error: 'Financial period not found' });
        }

        const [waitingRows] = await db.execute(
            `SELECT COUNT(*) as count, COALESCE(SUM(job.total_cost), 0) as total_amount
             FROM job_period
             JOIN job ON job_period.job_id = job.id
             WHERE job_period.financial_period_id = ? AND job.invoice_status = 'waiting'`,
            [id]
        );

        const [paidRows] = await db.execute(
            `SELECT COUNT(*) as count, COALESCE(SUM(job.total_cost), 0) as total_amount
             FROM job_period
             JOIN job ON job_period.job_id = job.id
             WHERE job_period.financial_period_id = ? AND job.invoice_status = 'paid'`,
            [id]
        );

        // Get expense totals for this period (both job-linked and standalone)
        const [expenseRows] = await db.execute(
            `SELECT COUNT(DISTINCT e.id) as count, COALESCE(SUM(e.amount), 0) as total_expenses
             FROM expense e
             WHERE e.id IN (
                 SELECT DISTINCT e2.id FROM expense e2
                 LEFT JOIN expense_job ej ON e2.id = ej.expense_id
                 LEFT JOIN job_period jp ON ej.job_id = jp.job_id
                 LEFT JOIN expense_financial_period efp ON e2.id = efp.expense_id
                 WHERE jp.financial_period_id = ? OR efp.financial_period_id = ?
             )`,
            [id, id]
        );

        res.status(200).json({
            period: periodRows[0],
            summary: {
                waiting: {
                    count: waitingRows[0].count,
                    total_amount: parseFloat(waitingRows[0].total_amount || 0)
                },
                paid: {
                    count: paidRows[0].count,
                    total_amount: parseFloat(paidRows[0].total_amount || 0)
                },
                combined: {
                    count: waitingRows[0].count + paidRows[0].count,
                    total_amount: parseFloat(waitingRows[0].total_amount || 0) + parseFloat(paidRows[0].total_amount || 0)
                },
                expenses: {
                    count: expenseRows[0].count,
                    total_amount: parseFloat(expenseRows[0].total_expenses || 0)
                }
            }
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to fetch period summary' });
    }
});

// POST domain.com/api/internal/finances/periods/:id/jobs
// Assign a job to a financial period. Affects: job_period table.
router.post('/periods/:id/jobs', async (req, res) => {
    const { id } = req.params;
    const { job_id } = req.body;

    if (!job_id) {
        return res.status(400).json({ error: 'job_id is required' });
    }

    try {
        const [periodCheck] = await db.execute(`SELECT id FROM financial_period WHERE id = ?`, [id]);
        if (periodCheck.length === 0) {
            return res.status(404).json({ error: 'Financial period not found' });
        }

        const [jobCheck] = await db.execute(`SELECT id FROM job WHERE id = ?`, [job_id]);
        if (jobCheck.length === 0) {
            return res.status(404).json({ error: 'Job not found' });
        }

        await db.execute(
            `INSERT INTO job_period (job_id, financial_period_id) VALUES (?, ?)`,
            [job_id, id]
        );

        res.status(201).json({ message: 'Job assigned to financial period successfully' });
    } catch (e) {
        if (e.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'Job is already assigned to this financial period' });
        }
        console.error(e);
        res.status(500).json({ error: 'Failed to assign job to financial period' });
    }
});

// DELETE domain.com/api/internal/finances/periods/:id/jobs/:jobId
// Remove a specific job from a financial period. Affects: job_period table.
router.delete('/periods/:id/jobs/:jobId', async (req, res) => {
    const { id, jobId } = req.params;

    try {
        const [check] = await db.execute(
            `SELECT id FROM job_period WHERE financial_period_id = ? AND job_id = ?`,
            [id, jobId]
        );
        if (check.length === 0) {
            return res.status(404).json({ error: 'Job is not assigned to this financial period' });
        }

        await db.execute(
            `DELETE FROM job_period WHERE financial_period_id = ? AND job_id = ?`,
            [id, jobId]
        );

        res.status(200).json({ message: 'Job removed from financial period successfully' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to remove job from financial period' });
    }
});

// DELETE domain.com/api/internal/finances/periods/:id/jobs
// Remove all jobs from a financial period. Affects: job_period table.
router.delete('/periods/:id/jobs', async (req, res) => {
    const { id } = req.params;

    try {
        const [periodCheck] = await db.execute(`SELECT id FROM financial_period WHERE id = ?`, [id]);
        if (periodCheck.length === 0) {
            return res.status(404).json({ error: 'Financial period not found' });
        }

        const [result] = await db.execute(
            `DELETE FROM job_period WHERE financial_period_id = ?`,
            [id]
        );

        res.status(200).json({ 
            message: 'All jobs cleared from financial period successfully',
            cleared_count: result.affectedRows
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to clear jobs from financial period' });
    }
});

// POST domain.com/api/internal/finances/periods/:id/jobs/bulk
// Bulk assign an array of job IDs to a financial period, skipping duplicates. Affects: job_period table.
router.post('/periods/:id/jobs/bulk', async (req, res) => {
    const { id } = req.params;
    const { job_ids } = req.body;

    if (!Array.isArray(job_ids) || job_ids.length === 0) {
        return res.status(400).json({ error: 'job_ids must be a non-empty array' });
    }

    try {
        const [periodCheck] = await db.execute(`SELECT id FROM financial_period WHERE id = ?`, [id]);
        if (periodCheck.length === 0) {
            return res.status(404).json({ error: 'Financial period not found' });
        }

        const results = { assigned: [], skipped: [], failed: [] };

        for (const job_id of job_ids) {
            try {
                const [jobCheck] = await db.execute(`SELECT id FROM job WHERE id = ?`, [job_id]);
                if (jobCheck.length === 0) {
                    results.failed.push({ job_id, reason: 'Job not found' });
                    continue;
                }
                await db.execute(
                    `INSERT INTO job_period (job_id, financial_period_id) VALUES (?, ?)`,
                    [job_id, id]
                );
                results.assigned.push(job_id);
            } catch (innerErr) {
                if (innerErr.code === 'ER_DUP_ENTRY') {
                    results.skipped.push({ job_id, reason: 'Already assigned' });
                } else {
                    results.failed.push({ job_id, reason: innerErr.message });
                }
            }
        }

        res.status(200).json({ message: 'Bulk assignment complete', results });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to bulk assign jobs to financial period' });
    }
});

// POST domain.com/api/internal/finances/periods/:id/jobs/range
// Bulk assign jobs to a financial period by invoice number range (inclusive). Affects: job_period table. Reads: job table.
router.post('/periods/:id/jobs/range', async (req, res) => {
    const { id } = req.params;
    const { invoice_from, invoice_to } = req.body;

    if (!invoice_from || !invoice_to) {
        return res.status(400).json({ error: 'invoice_from and invoice_to are required' });
    }

    const from = Number(invoice_from);
    const to = Number(invoice_to);

    if (isNaN(from) || isNaN(to)) {
        return res.status(400).json({ error: 'invoice_from and invoice_to must be numbers' });
    }

    if (from > to) {
        return res.status(400).json({ error: 'invoice_from must be less than or equal to invoice_to' });
    }

    try {
        const [periodCheck] = await db.execute(`SELECT id FROM financial_period WHERE id = ?`, [id]);
        if (periodCheck.length === 0) {
            return res.status(404).json({ error: 'Financial period not found' });
        }

        // Find all jobs whose invoice_number falls within the range
        const [jobs] = await db.execute(
            `SELECT id, invoice_number FROM job
             WHERE invoice_number IS NOT NULL
               AND CAST(invoice_number AS UNSIGNED) >= ?
               AND CAST(invoice_number AS UNSIGNED) <= ?`,
            [from, to]
        );

        if (jobs.length === 0) {
            return res.status(404).json({ error: `No jobs found with invoice numbers between ${from} and ${to}` });
        }

        const results = { assigned: [], skipped: [], failed: [] };

        for (const job of jobs) {
            try {
                await db.execute(
                    `INSERT INTO job_period (job_id, financial_period_id) VALUES (?, ?)`,
                    [job.id, id]
                );
                results.assigned.push({ job_id: job.id, invoice_number: job.invoice_number });
            } catch (innerErr) {
                if (innerErr.code === 'ER_DUP_ENTRY') {
                    results.skipped.push({ job_id: job.id, invoice_number: job.invoice_number, reason: 'Already assigned' });
                } else {
                    results.failed.push({ job_id: job.id, invoice_number: job.invoice_number, reason: innerErr.message });
                }
            }
        }

        res.status(200).json({
            message: 'Range assignment complete',
            range: { from, to },
            results
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to assign invoice range to financial period' });
    }
});

// GET domain.com/api/internal/finances/overview
// Get all financial periods each with a summary of invoice counts/totals and expense totals.
// Reads: financial_period, job_period, job, expense, expense_job, expense_financial_period tables.
router.get('/overview', async (req, res) => {
    try {
        const [periods] = await db.execute(
            `SELECT * FROM financial_period ORDER BY year DESC, quarter DESC`
        );

        const periodsWithSummary = await Promise.all(
            periods.map(async (period) => {
                const [waitingRows] = await db.execute(
                    `SELECT COUNT(*) as count, COALESCE(SUM(job.total_cost), 0) as total_amount
                     FROM job_period
                     JOIN job ON job_period.job_id = job.id
                     WHERE job_period.financial_period_id = ? AND job.invoice_status = 'waiting'`,
                    [period.id]
                );
                const [paidRows] = await db.execute(
                    `SELECT COUNT(*) as count, COALESCE(SUM(job.total_cost), 0) as total_amount
                     FROM job_period
                     JOIN job ON job_period.job_id = job.id
                     WHERE job_period.financial_period_id = ? AND job.invoice_status = 'paid'`,
                    [period.id]
                );
                
                // Get expense totals for this period (both job-linked and standalone)
                const [expenseRows] = await db.execute(
                    `SELECT COUNT(DISTINCT e.id) as count, COALESCE(SUM(e.amount), 0) as total_expenses
                     FROM expense e
                     WHERE e.id IN (
                         SELECT DISTINCT e2.id FROM expense e2
                         LEFT JOIN expense_job ej ON e2.id = ej.expense_id
                         LEFT JOIN job_period jp ON ej.job_id = jp.job_id
                         LEFT JOIN expense_financial_period efp ON e2.id = efp.expense_id
                         WHERE jp.financial_period_id = ? OR efp.financial_period_id = ?
                     )`,
                    [period.id, period.id]
                );
                
                return {
                    ...period,
                    summary: {
                        waiting: {
                            count: waitingRows[0].count,
                            total_amount: parseFloat(waitingRows[0].total_amount || 0)
                        },
                        paid: {
                            count: paidRows[0].count,
                            total_amount: parseFloat(paidRows[0].total_amount || 0)
                        },
                        combined: {
                            count: waitingRows[0].count + paidRows[0].count,
                            total_amount: parseFloat(waitingRows[0].total_amount || 0) + parseFloat(paidRows[0].total_amount || 0)
                        },
                        expenses: {
                            count: expenseRows[0].count,
                            total_amount: parseFloat(expenseRows[0].total_expenses || 0)
                        }
                    }
                };
            })
        );

        res.status(200).json({ periods: periodsWithSummary });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to fetch finances overview' });
    }
});

// GET domain.com/api/internal/finances/periods/:id/expenses
// Get all expenses assigned to a financial period with pagination and linked job details.
// Reads: expense_financial_period, expense, expense_job, job, company tables.
router.get('/periods/:id/expenses', async (req, res) => {
    const { id } = req.params;
    const limit = Number(req.query.limit) || 20;
    const offset = Number(req.query.offset) || 0;

    try {
        const [periodCheck] = await db.execute(`SELECT id FROM financial_period WHERE id = ?`, [id]);
        if (periodCheck.length === 0) {
            return res.status(404).json({ error: 'Financial period not found' });
        }

        // Get count for pagination
        const [countRows] = await db.execute(
            `SELECT COUNT(*) as total FROM expense_financial_period WHERE financial_period_id = ?`,
            [id]
        );
        const total = countRows[0].total;

        // Get expenses for this financial period
        const [rows] = await db.execute(
            `SELECT e.id, e.description, e.vendor, e.amount, e.expense_date,
                    e.category, e.notes, e.created_at,
                    efp.created_at AS link_created_at
             FROM expense_financial_period efp
             JOIN expense e ON efp.expense_id = e.id
             WHERE efp.financial_period_id = ?
             ORDER BY e.expense_date DESC
             LIMIT ${limit} OFFSET ${offset}`,
            [id]
        );

        // Get linked jobs for these expenses if any
        if (rows.length > 0) {
            const expenseIds = rows.map(e => e.id);
            const placeholders = expenseIds.map(() => '?').join(', ');

            const [jobLinks] = await db.execute(
                `SELECT ej.expense_id, ej.job_id, ej.notes AS link_notes,
                        j.job_number, company.name AS company_name
                 FROM expense_job ej
                 JOIN job j ON ej.job_id = j.id
                 JOIN company ON j.company_id = company.id
                 WHERE ej.expense_id IN (${placeholders})`,
                expenseIds
            );

            const jobsByExpense = jobLinks.reduce((acc, row) => {
                if (!acc[row.expense_id]) acc[row.expense_id] = [];
                acc[row.expense_id].push(row);
                return acc;
            }, {});

            rows.forEach(e => {
                e.jobs = jobsByExpense[e.id] ?? [];
            });
        }

        res.status(200).json({
            expenses: rows,
            pagination: { total, limit, offset, hasMore: offset + limit < total }
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to fetch expenses for period' });
    }
});

// POST domain.com/api/internal/finances/periods/:id/expenses
// Assign an expense to a financial period. Affects: expense_financial_period table.
router.post('/periods/:id/expenses', async (req, res) => {
    const { id } = req.params;
    const { expense_id } = req.body;

    if (!expense_id) {
        return res.status(400).json({ error: 'expense_id is required' });
    }

    try {
        const [periodCheck] = await db.execute(`SELECT id FROM financial_period WHERE id = ?`, [id]);
        if (periodCheck.length === 0) {
            return res.status(404).json({ error: 'Financial period not found' });
        }

        const [expenseCheck] = await db.execute(`SELECT id FROM expense WHERE id = ?`, [expense_id]);
        if (expenseCheck.length === 0) {
            return res.status(404).json({ error: 'Expense not found' });
        }

        await db.execute(
            `INSERT INTO expense_financial_period (expense_id, financial_period_id) VALUES (?, ?)`,
            [expense_id, id]
        );

        res.status(201).json({ message: 'Expense assigned to financial period successfully' });
    } catch (e) {
        if (e.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'Expense is already assigned to this financial period' });
        }
        console.error(e);
        res.status(500).json({ error: 'Failed to assign expense to financial period' });
    }
});

// DELETE domain.com/api/internal/finances/periods/:id/expenses/:expenseId
// Remove an expense from a financial period. Affects: expense_financial_period table.
router.delete('/periods/:id/expenses/:expenseId', async (req, res) => {
    const { id, expenseId } = req.params;

    try {
        const [check] = await db.execute(
            `SELECT id FROM expense_financial_period WHERE financial_period_id = ? AND expense_id = ?`,
            [id, expenseId]
        );
        if (check.length === 0) {
            return res.status(404).json({ error: 'Expense is not assigned to this financial period' });
        }

        await db.execute(
            `DELETE FROM expense_financial_period WHERE financial_period_id = ? AND expense_id = ?`,
            [id, expenseId]
        );

        res.status(200).json({ message: 'Expense removed from financial period successfully' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to remove expense from financial period' });
    }
});

// POST domain.com/api/internal/finances/periods/:id/expenses/bulk
// Bulk assign an array of expense IDs to a financial period, skipping duplicates. Affects: expense_financial_period table.
router.post('/periods/:id/expenses/bulk', async (req, res) => {
    const { id } = req.params;
    const { expense_ids } = req.body;

    if (!Array.isArray(expense_ids) || expense_ids.length === 0) {
        return res.status(400).json({ error: 'expense_ids must be a non-empty array' });
    }

    try {
        const [periodCheck] = await db.execute(`SELECT id FROM financial_period WHERE id = ?`, [id]);
        if (periodCheck.length === 0) {
            return res.status(404).json({ error: 'Financial period not found' });
        }

        const results = { assigned: [], skipped: [], failed: [] };

        for (const expense_id of expense_ids) {
            try {
                const [expenseCheck] = await db.execute(`SELECT id FROM expense WHERE id = ?`, [expense_id]);
                if (expenseCheck.length === 0) {
                    results.failed.push({ expense_id, reason: 'Expense not found' });
                    continue;
                }
                
                await db.execute(
                    `INSERT INTO expense_financial_period (expense_id, financial_period_id) VALUES (?, ?)`,
                    [expense_id, id]
                );
                results.assigned.push(expense_id);
            } catch (innerErr) {
                if (innerErr.code === 'ER_DUP_ENTRY') {
                    results.skipped.push(expense_id);
                } else {
                    results.failed.push({ expense_id, reason: innerErr.message });
                }
            }
        }

        res.status(200).json({ message: 'Bulk assignment complete', results });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to bulk assign expenses to financial period' });
    }
});

// GET domain.com/api/internal/finances/unassigned/expenses
// Get expenses not yet assigned to any financial period, with pagination and linked jobs.
// Reads: expense, expense_financial_period, expense_job, job, company tables.
router.get('/unassigned/expenses', async (req, res) => {
    const limit = Number(req.query.limit) || 20;
    const offset = Number(req.query.offset) || 0;

    try {
        const [countRows] = await db.execute(
            `SELECT COUNT(*) as total FROM expense
             WHERE id NOT IN (SELECT expense_id FROM expense_financial_period)`
        );
        const total = countRows[0].total;

        const [rows] = await db.execute(
            `SELECT e.id, e.description, e.vendor, e.amount, e.expense_date,
                    e.category, e.notes, e.created_at
             FROM expense e
             WHERE e.id NOT IN (SELECT expense_id FROM expense_financial_period)
             ORDER BY e.expense_date DESC
             LIMIT ${limit} OFFSET ${offset}`
        );

        // Get linked jobs for these expenses if any
        if (rows.length > 0) {
            const expenseIds = rows.map(e => e.id);
            const placeholders = expenseIds.map(() => '?').join(', ');

            const [jobLinks] = await db.execute(
                `SELECT ej.expense_id, ej.job_id, ej.notes AS link_notes,
                        j.job_number, company.name AS company_name
                 FROM expense_job ej
                 JOIN job j ON ej.job_id = j.id
                 JOIN company ON j.company_id = company.id
                 WHERE ej.expense_id IN (${placeholders})`,
                expenseIds
            );

            const jobsByExpense = jobLinks.reduce((acc, row) => {
                if (!acc[row.expense_id]) acc[row.expense_id] = [];
                acc[row.expense_id].push(row);
                return acc;
            }, {});

            rows.forEach(e => {
                e.jobs = jobsByExpense[e.id] ?? [];
            });
        }

        res.status(200).json({
            expenses: rows,
            pagination: { total, limit, offset, hasMore: offset + limit < total }
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to fetch unassigned expenses' });
    }
});

// GET domain.com/api/internal/finances/unassigned
// Get invoiced jobs not yet assigned to any financial period, with pagination and expense totals.
// Reads: job, job_period, company, expense_job, expense tables.
router.get('/unassigned', async (req, res) => {
    const limit = Number(req.query.limit) || 20;
    const offset = Number(req.query.offset) || 0;

    try {
        const [countRows] = await db.execute(
            `SELECT COUNT(*) as total FROM job
             WHERE invoice_number IS NOT NULL
               AND id NOT IN (SELECT job_id FROM job_period)`
        );
        const total = countRows[0].total;

        const [rows] = await db.execute(
            `SELECT job.id, job.job_number, job.company_id, job.po_number,
                    job.invoice_number, job.attention, job.total_cost,
                    job.invoice_date, job.invoice_status, job.created_at,
                    company.name AS company_name,
                    COALESCE(expense_totals.total_expenses, 0) AS total_expenses
             FROM job
             JOIN company ON job.company_id = company.id
             LEFT JOIN (
                 SELECT ej.job_id, SUM(e.amount) AS total_expenses
                 FROM expense_job ej
                 JOIN expense e ON ej.expense_id = e.id
                 GROUP BY ej.job_id
             ) AS expense_totals ON job.id = expense_totals.job_id
             WHERE job.invoice_number IS NOT NULL
               AND job.id NOT IN (SELECT job_id FROM job_period)
             ORDER BY job.invoice_date DESC
             LIMIT ${limit} OFFSET ${offset}`
        );

        res.status(200).json({
            invoices: rows,
            pagination: { total, limit, offset, hasMore: offset + limit < total }
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to fetch unassigned invoices' });
    }
});

module.exports = router;
