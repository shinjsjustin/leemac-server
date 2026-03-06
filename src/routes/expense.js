const express = require('express');
const router = express.Router();
const db = require('../db/db');

// Create a new expense, optionally linked to one or more jobs and/or financial periods
// Body: { description, vendor, amount, expense_date, category, notes, jobIds: [1, 2, ...], periodIds: [1, 2, ...] }
router.post('/create', async (req, res) => {
    const { description, vendor, amount, expense_date, category, notes, jobIds, periodIds } = req.body;

    if (!description || !amount || !expense_date) {
        return res.status(400).json({ error: 'description, amount, and expense_date are required' });
    }

    // Convert ISO timestamp to date format (YYYY-MM-DD)
    const dateOnly = new Date(expense_date).toISOString().split('T')[0];

    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        const [result] = await conn.execute(
            `INSERT INTO expense (description, vendor, amount, expense_date, category, notes)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [description, vendor ?? null, amount, dateOnly, category ?? null, notes ?? null]
        );

        const expenseId = result.insertId;

        // Link to jobs if provided
        if (Array.isArray(jobIds) && jobIds.length > 0) {
            const values = jobIds.map(jobId => [expenseId, jobId]);
            await conn.query(
                `INSERT INTO expense_job (expense_id, job_id) VALUES ?`,
                [values]
            );
        }

        // Link to financial periods if provided
        if (Array.isArray(periodIds) && periodIds.length > 0) {
            const values = periodIds.map(periodId => [expenseId, periodId]);
            await conn.query(
                `INSERT INTO expense_financial_period (expense_id, financial_period_id) VALUES ?`,
                [values]
            );
        }

        await conn.commit();
        res.status(201).json({ id: expenseId });
    } catch (e) {
        await conn.rollback();
        console.error(e);
        res.status(500).json({ error: 'Failed to create expense' });
    } finally {
        conn.release();
    }
});

// Edit an existing expense's fields
// Body: { description, vendor, amount, expense_date, category, notes }
router.put('/update/:id', async (req, res) => {
    const { id } = req.params;
    const { description, vendor, amount, expense_date, category, notes } = req.body;

    if (!description || !amount || !expense_date) {
        return res.status(400).json({ error: 'description, amount, and expense_date are required' });
    }

    // Convert ISO timestamp to date format (YYYY-MM-DD)
    const dateOnly = new Date(expense_date).toISOString().split('T')[0];

    try {
        const [result] = await db.execute(
            `UPDATE expense
             SET description = ?, vendor = ?, amount = ?, expense_date = ?, category = ?, notes = ?
             WHERE id = ?`,
            [description, vendor ?? null, amount, dateOnly, category ?? null, notes ?? null, id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Expense not found' });
        }

        res.status(200).json({ message: 'Expense updated successfully' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to update expense' });
    }
});

// Delete an expense (cascade deletes expense_job rows via FK)
router.delete('/delete/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const [result] = await db.execute(
            `DELETE FROM expense WHERE id = ?`,
            [id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Expense not found' });
        }

        res.status(200).json({ message: 'Expense deleted successfully' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to delete expense' });
    }
});

// Link an existing expense to one or more jobs
// Body: { jobIds: [1, 2, ...] }
router.post('/linkjobs/:expenseId', async (req, res) => {
    const { expenseId } = req.params;
    const { jobIds } = req.body;

    if (!Array.isArray(jobIds) || jobIds.length === 0) {
        return res.status(400).json({ error: 'jobIds must be a non-empty array' });
    }

    try {
        const values = jobIds.map(jobId => [expenseId, jobId]);
        await db.query(
            `INSERT IGNORE INTO expense_job (expense_id, job_id) VALUES ?`,
            [values]
        );
        res.status(201).json({ message: 'Jobs linked to expense successfully' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to link jobs to expense' });
    }
});

// Unlink a specific job from an expense
router.delete('/unlinkjob', async (req, res) => {
    const { expenseId, jobId } = req.body;

    if (!expenseId || !jobId) {
        return res.status(400).json({ error: 'expenseId and jobId are required' });
    }

    try {
        const [result] = await db.execute(
            `DELETE FROM expense_job WHERE expense_id = ? AND job_id = ?`,
            [expenseId, jobId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Expense-job link not found' });
        }

        res.status(200).json({ message: 'Job unlinked from expense successfully' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to unlink job from expense' });
    }
});

// Link an existing expense to one or more financial periods
// Body: { periodIds: [1, 2, ...] }
router.post('/linkperiods/:expenseId', async (req, res) => {
    const { expenseId } = req.params;
    const { periodIds } = req.body;

    if (!Array.isArray(periodIds) || periodIds.length === 0) {
        return res.status(400).json({ error: 'periodIds must be a non-empty array' });
    }

    try {
        const values = periodIds.map(periodId => [expenseId, periodId]);
        await db.query(
            `INSERT IGNORE INTO expense_financial_period (expense_id, financial_period_id) VALUES ?`,
            [values]
        );
        res.status(201).json({ message: 'Financial periods linked to expense successfully' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to link financial periods to expense' });
    }
});

// Unlink a specific financial period from an expense
router.delete('/unlinkperiod', async (req, res) => {
    const { expenseId, periodId } = req.body;

    if (!expenseId || !periodId) {
        return res.status(400).json({ error: 'expenseId and periodId are required' });
    }

    try {
        const [result] = await db.execute(
            `DELETE FROM expense_financial_period WHERE expense_id = ? AND financial_period_id = ?`,
            [expenseId, periodId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Expense-period link not found' });
        }

        res.status(200).json({ message: 'Financial period unlinked from expense successfully' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to unlink financial period from expense' });
    }
});

// Get all expenses, with their linked jobs and financial periods
router.get('/all', async (req, res) => {
    const limit = Number(req.query.limit) || 20;
    const offset = Number(req.query.offset) || 0;

    try {
        const [countRows] = await db.execute(`SELECT COUNT(*) as total FROM expense`);
        const total = countRows[0].total;

        const [expenses] = await db.execute(
            `SELECT * FROM expense ORDER BY expense_date DESC LIMIT ${limit} OFFSET ${offset}`
        );

        if (expenses.length > 0) {
            const expenseIds = expenses.map(e => e.id);
            const placeholders = expenseIds.map(() => '?').join(', ');

            // Get linked jobs
            const [jobLinks] = await db.execute(
                `SELECT ej.expense_id, ej.job_id, ej.notes AS link_notes,
                        j.job_number, company.name AS company_name
                 FROM expense_job ej
                 JOIN job j ON ej.job_id = j.id
                 JOIN company ON j.company_id = company.id
                 WHERE ej.expense_id IN (${placeholders})`,
                expenseIds
            );

            // Get linked financial periods
            const [periodLinks] = await db.execute(
                `SELECT efp.expense_id, efp.financial_period_id,
                        fp.lable AS period_label, fp.quarter, fp.year
                 FROM expense_financial_period efp
                 JOIN financial_period fp ON efp.financial_period_id = fp.id
                 WHERE efp.expense_id IN (${placeholders})`,
                expenseIds
            );

            const jobsByExpense = jobLinks.reduce((acc, row) => {
                if (!acc[row.expense_id]) acc[row.expense_id] = [];
                acc[row.expense_id].push(row);
                return acc;
            }, {});

            const periodsByExpense = periodLinks.reduce((acc, row) => {
                if (!acc[row.expense_id]) acc[row.expense_id] = [];
                acc[row.expense_id].push(row);
                return acc;
            }, {});

            expenses.forEach(e => {
                e.jobs = jobsByExpense[e.id] ?? [];
                e.periods = periodsByExpense[e.id] ?? [];
            });
        }

        res.status(200).json({
            expenses,
            pagination: { total, limit, offset, hasMore: offset + limit < total }
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to fetch expenses' });
    }
});

// Get all expenses linked to a specific job
router.get('/byjob/:jobId', async (req, res) => {
    const { jobId } = req.params;

    try {
        const [rows] = await db.execute(
            `SELECT e.*, ej.notes AS link_notes
             FROM expense e
             JOIN expense_job ej ON e.id = ej.expense_id
             WHERE ej.job_id = ?
             ORDER BY e.expense_date DESC`,
            [jobId]
        );
        res.status(200).json(rows);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to fetch expenses for job' });
    }
});

// Get all expenses linked to a specific financial period
router.get('/byperiod/:periodId', async (req, res) => {
    const { periodId } = req.params;
    const limit = Number(req.query.limit) || 20;
    const offset = Number(req.query.offset) || 0;

    try {
        // Get count for pagination
        const [countRows] = await db.execute(
            `SELECT COUNT(*) as total
             FROM expense e
             JOIN expense_financial_period efp ON e.id = efp.expense_id
             WHERE efp.financial_period_id = ?`,
            [periodId]
        );
        const total = countRows[0].total;

        // Get expenses with pagination
        const [expenses] = await db.execute(
            `SELECT e.*, efp.created_at AS link_created_at
             FROM expense e
             JOIN expense_financial_period efp ON e.id = efp.expense_id
             WHERE efp.financial_period_id = ?
             ORDER BY e.expense_date DESC
             LIMIT ${limit} OFFSET ${offset}`,
            [periodId]
        );

        // Get linked jobs for these expenses
        if (expenses.length > 0) {
            const expenseIds = expenses.map(e => e.id);
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

            expenses.forEach(e => {
                e.jobs = jobsByExpense[e.id] ?? [];
            });
        }

        res.status(200).json({
            expenses,
            pagination: { total, limit, offset, hasMore: offset + limit < total }
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to fetch expenses for financial period' });
    }
});

// Get a single expense with its linked jobs and financial periods
router.get('/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const [expenseRows] = await db.execute(
            `SELECT * FROM expense WHERE id = ?`,
            [id]
        );

        if (expenseRows.length === 0) {
            return res.status(404).json({ error: 'Expense not found' });
        }

        // Get linked jobs
        const [jobs] = await db.execute(
            `SELECT ej.job_id, ej.notes AS link_notes, j.job_number, company.name AS company_name
             FROM expense_job ej
             JOIN job j ON ej.job_id = j.id
             JOIN company ON j.company_id = company.id
             WHERE ej.expense_id = ?`,
            [id]
        );

        // Get linked financial periods
        const [periods] = await db.execute(
            `SELECT efp.financial_period_id, fp.lable AS period_label, fp.quarter, fp.year
             FROM expense_financial_period efp
             JOIN financial_period fp ON efp.financial_period_id = fp.id
             WHERE efp.expense_id = ?`,
            [id]
        );

        res.status(200).json({ ...expenseRows[0], jobs, periods });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to fetch expense' });
    }
});

module.exports = router;
