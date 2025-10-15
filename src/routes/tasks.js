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

// Complete task endpoint - sets numerator equal to denominator
router.post('/completetask', async (req, res) => {
    const { job_part_id, task_id } = req.body;

    if (!job_part_id || !task_id) {
        return res.status(400).json({ error: 'Part ID and task ID are required' });
    }

    try {
        // First get the current denominator value
        const [taskRows] = await db.execute(
            `SELECT denominator FROM tasks WHERE job_part_id = ? AND id = ?`,
            [job_part_id, task_id]
        );

        if (taskRows.length === 0) {
            return res.status(404).json({ error: 'Task not found' });
        }

        const denominator = taskRows[0].denominator || 1;

        // Update numerator to equal denominator (100% complete)
        await db.execute(
            `UPDATE tasks SET numerator = ? WHERE job_part_id = ? AND id = ?`,
            [denominator, job_part_id, task_id]
        );

        res.status(200).json({ message: 'Task completed successfully' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Server error when completing task' });
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

// Bulk create tasks for multiple job_part_ids
router.post('/bulkcreatetasks', async (req, res) => {
    const { job_part_ids, tasks } = req.body;

    if (!Array.isArray(job_part_ids) || job_part_ids.length === 0) {
        return res.status(400).json({ error: 'job_part_ids must be a non-empty array' });
    }

    if (!Array.isArray(tasks) || tasks.length === 0) {
        return res.status(400).json({ error: 'tasks must be a non-empty array' });
    }

    try {
        const insertPromises = [];
        
        for (const jobPartId of job_part_ids) {
            for (const task of tasks) {
                const { name, numerator, denominator, note } = task;
                
                // Check if task already exists for this job_part_id
                const [existingTask] = await db.execute(
                    `SELECT id FROM tasks WHERE job_part_id = ? AND name = ?`,
                    [jobPartId, name]
                );
                
                // Only create if it doesn't exist
                if (existingTask.length === 0) {
                    insertPromises.push(
                        db.execute(
                            `INSERT INTO tasks (job_part_id, name, numerator, denominator, note) VALUES (?, ?, ?, ?, ?)`,
                            [jobPartId, name, numerator || 0, denominator || 1, note || null]
                        )
                    );
                }
            }
        }

        await Promise.all(insertPromises);

        res.status(201).json({ 
            message: 'Bulk tasks created successfully',
            created_count: insertPromises.length
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Server error when bulk creating tasks' });
    }
});

// Bulk create standard tasks for parts with specific quantities
router.post('/createstandardtasks', async (req, res) => {
    const { parts_data } = req.body;

    if (!Array.isArray(parts_data) || parts_data.length === 0) {
        return res.status(400).json({ error: 'parts_data must be a non-empty array' });
    }

    try {
        const insertPromises = [];
        
        for (const partData of parts_data) {
            const { job_part_id, quantity } = partData;
            
            if (!job_part_id) {
                continue; // Skip invalid entries
            }

            const standardTasks = [
                {
                    name: 'Material Procurement',
                    numerator: 0,
                    denominator: quantity || 1,
                    note: 'Procure materials needed for production'
                },
                {
                    name: 'Program Check',
                    numerator: 0,
                    denominator: 1,
                    note: 'Verify and validate manufacturing programs'
                },
                {
                    name: 'Manufacture',
                    numerator: 0,
                    denominator: quantity || 1,
                    note: 'Manufacturing process execution'
                },
                {
                    name: 'Check Finish',
                    numerator: 0,
                    denominator: 1,
                    note: 'Quality control and finishing inspection'
                },
                {
                    name: 'Deliver',
                    numerator: 0,
                    denominator: 1,
                    note: 'Package and deliver completed parts'
                }
            ];

            for (const task of standardTasks) {
                // Check if task already exists for this job_part_id
                const [existingTask] = await db.execute(
                    `SELECT id FROM tasks WHERE job_part_id = ? AND name = ?`,
                    [job_part_id, task.name]
                );
                
                // Only create if it doesn't exist
                if (existingTask.length === 0) {
                    insertPromises.push(
                        db.execute(
                            `INSERT INTO tasks (job_part_id, name, numerator, denominator, note) VALUES (?, ?, ?, ?, ?)`,
                            [job_part_id, task.name, task.numerator, task.denominator, task.note]
                        )
                    );
                }
            }
        }

        await Promise.all(insertPromises);

        res.status(201).json({ 
            message: 'Standard tasks created successfully',
            created_count: insertPromises.length
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Server error when creating standard tasks' });
    }
});

// Get task metrics for multiple jobs (for starred jobs page)
router.post('/getjobsmetrics', async (req, res) => {
    const { job_ids } = req.body;

    if (!Array.isArray(job_ids) || job_ids.length === 0) {
        return res.status(400).json({ error: 'job_ids must be a non-empty array' });
    }

    try {
        // Get all job_part_ids for the given jobs
        const placeholders = job_ids.map(() => '?').join(', ');
        const [jobParts] = await db.execute(
            `SELECT jp.id as job_part_id, jp.job_id, jp.quantity 
             FROM job_part jp 
             WHERE jp.job_id IN (${placeholders})`,
            job_ids
        );

        if (jobParts.length === 0) {
            return res.status(200).json({
                material: { numerator: 0, denominator: 0 },
                programming: { numerator: 0, denominator: 0 },
                manufacturing: { numerator: 0, denominator: 0 },
                total: { numerator: 0, denominator: 0 }
            });
        }

        // Get all tasks for these job_part_ids
        const jobPartIds = jobParts.map(jp => jp.job_part_id);
        const taskPlaceholders = jobPartIds.map(() => '?').join(', ');
        
        const [tasks] = await db.execute(
            `SELECT job_part_id, name, numerator, denominator 
             FROM tasks 
             WHERE job_part_id IN (${taskPlaceholders}) 
             AND numerator IS NOT NULL AND denominator IS NOT NULL`,
            jobPartIds
        );

        // Calculate metrics
        let materialTotal = { numerator: 0, denominator: 0 };
        let programmingTotal = { numerator: 0, denominator: 0 };
        let manufacturingTotal = { numerator: 0, denominator: 0 };
        let overallTotal = { numerator: 0, denominator: 0 };

        tasks.forEach(task => {
            const taskNumerator = task.numerator || 0;
            const taskDenominator = task.denominator || 0;
            
            // Add to overall total
            overallTotal.numerator += taskNumerator;
            overallTotal.denominator += taskDenominator;
            
            // Categorize by task name
            if (task.name === 'Material Procurement') {
                materialTotal.numerator += taskNumerator;
                materialTotal.denominator += taskDenominator;
            } else if (task.name === 'Program Check') {
                programmingTotal.numerator += taskNumerator;
                programmingTotal.denominator += taskDenominator;
            } else if (task.name === 'Manufacture') {
                manufacturingTotal.numerator += taskNumerator;
                manufacturingTotal.denominator += taskDenominator;
            }
        });

        res.status(200).json({
            material: materialTotal,
            programming: programmingTotal,
            manufacturing: manufacturingTotal,
            total: overallTotal
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Server error when fetching jobs metrics' });
    }
});

// Get individual job metrics (for per-job breakdown in starred jobs)
router.get('/getjobmetrics', async (req, res) => {
    const { job_id } = req.query;

    if (!job_id) {
        return res.status(400).json({ error: 'Job ID is required' });
    }

    try {
        // Get all job_part_ids for the job
        const [jobParts] = await db.execute(
            `SELECT jp.id as job_part_id, jp.quantity 
             FROM job_part jp 
             WHERE jp.job_id = ?`,
            [job_id]
        );

        if (jobParts.length === 0) {
            return res.status(200).json({
                material: { numerator: 0, denominator: 0 },
                programming: { numerator: 0, denominator: 0 },
                manufacturing: { numerator: 0, denominator: 0 },
                total: { numerator: 0, denominator: 0 }
            });
        }

        // Get all tasks for these job_part_ids
        const jobPartIds = jobParts.map(jp => jp.job_part_id);
        const placeholders = jobPartIds.map(() => '?').join(', ');
        
        const [tasks] = await db.execute(
            `SELECT name, numerator, denominator 
             FROM tasks 
             WHERE job_part_id IN (${placeholders}) 
             AND numerator IS NOT NULL AND denominator IS NOT NULL`,
            jobPartIds
        );

        // Calculate metrics
        let materialTotal = { numerator: 0, denominator: 0 };
        let programmingTotal = { numerator: 0, denominator: 0 };
        let manufacturingTotal = { numerator: 0, denominator: 0 };
        let overallTotal = { numerator: 0, denominator: 0 };

        tasks.forEach(task => {
            const taskNumerator = task.numerator || 0;
            const taskDenominator = task.denominator || 0;
            
            // Add to overall total
            overallTotal.numerator += taskNumerator;
            overallTotal.denominator += taskDenominator;
            
            // Categorize by task name
            if (task.name === 'Material Procurement') {
                materialTotal.numerator += taskNumerator;
                materialTotal.denominator += taskDenominator;
            } else if (task.name === 'Program Check') {
                programmingTotal.numerator += taskNumerator;
                programmingTotal.denominator += taskDenominator;
            } else if (task.name === 'Manufacture') {
                manufacturingTotal.numerator += taskNumerator;
                manufacturingTotal.denominator += taskDenominator;
            }
        });

        res.status(200).json({
            material: materialTotal,
            programming: programmingTotal,
            manufacturing: manufacturingTotal,
            total: overallTotal
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Server error when fetching job metrics' });
    }
});

module.exports = router;
