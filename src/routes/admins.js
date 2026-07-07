const express = require('express');
const router = express.Router();
const db = require('../db/db');

// GET domain.com/api/internal/admins/getadmins
// Retrieve all admin accounts with id, name, access_level, email, and company_id. Reads: admin table.
router.get('/getadmins', async (req, res) => {
    try {
        const [admins] = await db.query(
            'SELECT id, name, access_level, email, company_id FROM admin'
        );
        res.json(admins);
    } catch (error) {
        res.status(500).json({ error: 'Database error', details: error.message });
    }
});

// GET domain.com/api/internal/admins/getadmin/:id
// Retrieve name, email, and company_id for a specific admin by their ID. Reads: admin table.
router.get('/getadmin/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const [admin] = await db.query(
            'SELECT name, email, company_id FROM admin WHERE id = ?',
            [id]
        );
        if (admin.length === 0) {
            return res.status(404).json({ error: 'Admin not found' });
        }
        res.json(admin[0]);
    } catch (error) {
        res.status(500).json({ error: 'Database error', details: error.message });
    }
});

// PUT domain.com/api/internal/admins/editadmin
// Update an admin's name, access_level, email, or company_id by ID. Affects: admin table.
router.put('/editadmin', async (req, res) => {
    const { id, name, access_level, email, company_id } = req.body;
    if (!id || (!name && !access_level && !email && !company_id)) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    try {
        const [result] = await db.query(
            'UPDATE admin SET name = COALESCE(?, name), access_level = COALESCE(?, access_level), email = COALESCE(?, email), company_id = COALESCE(?, company_id) WHERE id = ?',
            [name, access_level, email, company_id, id]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Admin not found' });
        }
        res.json({ message: 'Admin updated successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Database error', details: error.message });
    }
});

// POST domain.com/api/internal/admins/admin-job
// Link an admin to a job, creating a many-to-many relationship. Affects: job_admin table.
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

// DELETE domain.com/api/internal/admins/admin-job
// Remove the link between an admin and a job. Affects: job_admin table.
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

// GET domain.com/api/internal/admins/getlinkedjobs/:adminId
// Get all job IDs linked to a specific admin. Reads: job_admin table.
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

