const express = require('express');
const router = express.Router();
const db = require('../db/db');

// Get all admins with selected fields
router.get('/getadmins', async (req, res) => {
    try {
        const [admins] = await db.query(
            'SELECT id, name, access_level, email FROM admin'
        );
        res.json(admins);
    } catch (error) {
        res.status(500).json({ error: 'Database error', details: error.message });
    }
});

// Edit an admin's details
router.put('/editadmin', async (req, res) => {
    const { id, name, access_level, email } = req.body;
    if (!id || (!name && !access_level && !email)) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    try {
        const [result] = await db.query(
            'UPDATE admin SET name = COALESCE(?, name), access_level = COALESCE(?, access_level), email = COALESCE(?, email) WHERE id = ?',
            [name, access_level, email, id]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Admin not found' });
        }
        res.json({ message: 'Admin updated successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Database error', details: error.message });
    }
});

// Add an admin-job relationship
router.post('/admin-job', async (req, res) => {
    const { job_id, admin_id } = req.body;
    if (!job_id || !admin_id) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    try {
        await db.query(
            'INSERT INTO job_admin (job_id, admin_id) VALUES (?, ?)',
            [job_id, admin_id]
        );
        res.status(201).json({ message: 'Admin-job relationship created successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Database error', details: error.message });
    }
});

// Delete an admin-job relationship
router.delete('/admin-job', async (req, res) => {
    const { job_id, admin_id } = req.body;
    if (!job_id || !admin_id) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    try {
        const [result] = await db.query(
            'DELETE FROM job_admin WHERE job_id = ? AND admin_id = ?',
            [job_id, admin_id]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Admin-job relationship not found' });
        }
        res.json({ message: 'Admin-job relationship deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Database error', details: error.message });
    }
});

// Get jobs linked to a specific admin
router.get('/getlinkedjobs/:adminId', async (req, res) => {
    const { adminId } = req.params;
    try {
        const [linkedJobs] = await db.query(
            'SELECT job_id FROM job_admin WHERE admin_id = ?',
            [adminId]
        );
        res.json(linkedJobs);
    } catch (error) {
        res.status(500).json({ error: 'Database error', details: error.message });
    }
});

module.exports = router;

