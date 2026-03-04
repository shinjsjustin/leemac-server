const express = require('express');
const router = express.Router();
const db = require('../db/db');

// Create a new expense, optionally linked to one or more jobs
// Body: { description, vendor, amount, expense_date, category, notes, jobIds: [1, 2, ...] }
router.post('/create', async (req, res) => {
    const { description, vendor, amount, expense_date, category, notes, jobIds } = req.body;

    if (!description || !amount || !expense_date) {
        return res.status(400).json({ error: 'description, amount, and expense_date are required' });
    }

    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        const [result] = await conn.execute(
            `INSERT INTO expense (description, vendor, amount, expense_date, category, notes)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [description, vendor ?? null, amount, expense_date, category ?? null, notes ?? null]
        );

        const expenseId = result.insertId;

        if (Array.isArray(jobIds) && jobIds.length > 0) {
            const values = jobIds.map(jobId => [expenseId, jobId]);
            await conn.query(
                `INSERT INTO expense_job (expense_id, job_id) VALUES ?`,
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

    try {
        const [result] = await db.execute(
            `UPDATE expense
             SET description = ?, vendor = ?, amount = ?, expense_date = ?, category = ?, notes = ?
             WHERE id = ?`,
            [description, vendor ?? null, amount, expense_date, category ?? null, notes ?? null, id]
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

// Get all expenses, with their linked jobs
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

            const [links] = await db.execute(
                `SELECT ej.expense_id, ej.job_id, ej.notes AS link_notes,
                        j.job_number, company.name AS company_name
                 FROM expense_job ej
                 JOIN job j ON ej.job_id = j.id
                 JOIN company ON j.company_id = company.id
                 WHERE ej.expense_id IN (${placeholders})`,
                expenseIds
            );

            const jobsByExpense = links.reduce((acc, row) => {
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

// Get a single expense with its linked jobs
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

        const [jobs] = await db.execute(
            `SELECT ej.job_id, ej.notes AS link_notes, j.job_number, company.name AS company_name
             FROM expense_job ej
             JOIN job j ON ej.job_id = j.id
             JOIN company ON j.company_id = company.id
             WHERE ej.expense_id = ?`,
            [id]
        );

        res.status(200).json({ ...expenseRows[0], jobs });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to fetch expense' });
    }
});

module.exports = router;
