const express = require('express');
const router = express.Router();
const db = require('../db/db');

// Create a new task
router.post('/newtask', async (req, res) => {
    const { job_part_id, name, numerator, denominator, note } = req.body;

    if (!job_part_id || !name) {
        return res.status(400).json({ error: 'Part ID and task name are required' });
    }

    try {
        const [result] = await db.execute(
            `INSERT INTO tasks (job_part_id, name, numerator, denominator, note) VALUES (?, ?, ?, ?, ?)`,
            [job_part_id, name, numerator || null, denominator || null, note || null]
        );

        res.status(201).json({ 
            id: result.insertId, 
            message: 'Task created successfully' 
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Server error when creating new task' });
    }
});

// Update task by job_job_part_id and task name (or task id if provided)
router.post('/updatetask', async (req, res) => {
    const { job_part_id, task_id, name, numerator, denominator, note } = req.body;

    if (!job_part_id) {
        return res.status(400).json({ error: 'Part ID is required' });
    }

    if (!task_id && !name) {
        return res.status(400).json({ error: 'Either task ID or task name is required to identify the task' });
    }

    try {
        // Build dynamic query based on provided fields
        let updateFields = [];
        let queryParams = [];

        if (name !== undefined && !task_id) {
            // If updating by name and no task_id provided, name is the identifier
        } else if (name !== undefined) {
            updateFields.push('name = ?');
            queryParams.push(name);
        }
        
        if (numerator !== undefined) {
            updateFields.push('numerator = ?');
            queryParams.push(numerator);
        }
        if (denominator !== undefined) {
            updateFields.push('denominator = ?');
            queryParams.push(denominator);
        }
        if (note !== undefined) {
            updateFields.push('note = ?');
            queryParams.push(note);
        }

        if (updateFields.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        let whereClause;
        if (task_id) {
            whereClause = 'WHERE job_part_id = ? AND id = ?';
            queryParams.push(job_part_id, task_id);
        } else {
            whereClause = 'WHERE job_part_id = ? AND name = ?';
            queryParams.push(job_part_id, name);
        }

        await db.execute(
            `UPDATE tasks SET ${updateFields.join(', ')} ${whereClause}`,
            queryParams
        );

        res.status(200).json({ message: 'Task updated successfully' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Server error when updating task' });
    }
});

// Update task progress by job_part_id and task identifier
router.post('/updateprogress', async (req, res) => {
    const { job_part_id, task_id, task_name, numerator } = req.body;

    if (!job_part_id || numerator === undefined) {
        return res.status(400).json({ error: 'Part ID and numerator are required' });
    }

    if (!task_id && !task_name) {
        return res.status(400).json({ error: 'Either task ID or task name is required' });
    }

    try {
        let whereClause;
        let queryParams = [numerator];

        if (task_id) {
            whereClause = 'WHERE job_part_id = ? AND id = ?';
            queryParams.push(job_part_id, task_id);
        } else {
            whereClause = 'WHERE job_part_id = ? AND name = ?';
            queryParams.push(job_part_id, task_name);
        }

        await db.execute(
            `UPDATE tasks SET numerator = ? ${whereClause}`,
            queryParams
        );

        res.status(200).json({ message: 'Task progress updated successfully' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Server error when updating task progress' });
    }
});

// Get all tasks for a specific part (main endpoint)
router.get('/gettasks', async (req, res) => {
    const { job_part_id } = req.query;

    if (!job_part_id) {
        return res.status(400).json({ error: 'Part ID is required' });
    }

    try {
        const [rows] = await db.execute(
            `SELECT id, job_part_id, name, numerator, denominator, note, created_at, updated_at 
             FROM tasks WHERE job_part_id = ? ORDER BY created_at DESC`,
            [job_part_id]
        );

        res.status(200).json(rows);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Server error when fetching tasks' });
    }
});

// Delete task by job_part_id and task identifier
router.delete('/deletetask', async (req, res) => {
    const { job_part_id, task_id, task_name } = req.query;

    if (!job_part_id) {
        return res.status(400).json({ error: 'Part ID is required' });
    }

    if (!task_id && !task_name) {
        return res.status(400).json({ error: 'Either task ID or task name is required' });
    }

    try {
        let whereClause;
        let queryParams = [];

        if (task_id) {
            whereClause = 'WHERE job_part_id = ? AND id = ?';
            queryParams = [job_part_id, task_id];
        } else {
            whereClause = 'WHERE job_part_id = ? AND name = ?';
            queryParams = [job_part_id, task_name];
        }

        const [result] = await db.execute(
            `DELETE FROM tasks ${whereClause}`,
            queryParams
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Task not found' });
        }

        res.status(200).json({ message: 'Task deleted successfully' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Server error when deleting task' });
    }
});

// Get task progress summary for a part
router.get('/getprogress', async (req, res) => {
    const { job_part_id } = req.query;

    if (!job_part_id) {
        return res.status(400).json({ error: 'Part ID is required' });
    }

    try {
        const [rows] = await db.execute(
            `SELECT 
                COUNT(*) as total_tasks,
                SUM(CASE WHEN numerator IS NOT NULL AND denominator IS NOT NULL 
                    AND numerator >= denominator THEN 1 ELSE 0 END) as completed_tasks,
                AVG(CASE WHEN numerator IS NOT NULL AND denominator IS NOT NULL 
                    AND denominator > 0 THEN (numerator / denominator) * 100 ELSE 0 END) as avg_progress
             FROM tasks WHERE job_part_id = ?`,
            [job_part_id]
        );

        res.status(200).json(rows[0]);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Server error when calculating progress' });
    }
});

// Delete all tasks for a part (useful when deleting a part)
router.delete('/deletealltasks', async (req, res) => {
    const { job_part_id } = req.query;

    if (!job_part_id) {
        return res.status(400).json({ error: 'Part ID is required' });
    }

    try {
        const [result] = await db.execute(
            `DELETE FROM tasks WHERE job_part_id = ?`,
            [job_part_id]
        );

        res.status(200).json({ 
            message: 'All tasks deleted successfully',
            deleted_count: result.affectedRows 
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Server error when deleting tasks' });
    }
});

module.exports = router;
