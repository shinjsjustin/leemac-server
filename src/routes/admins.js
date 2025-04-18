const express = require('express');
const router = express.Router();
const db = require('../db/db');

// Get all admins with selected fields
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

// Get admin details by ID
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

// Edit an admin's details
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
    // console.log('adminId:', adminId); // Log the adminId for debugging
    try {
        const [linkedJobs] = await db.query(
            'SELECT job_id FROM job_admin WHERE admin_id = ?',
            [adminId]
        );
        // console.log('Linked job IDs:', linkedJobs); // Log the job IDs returned
        res.json(linkedJobs);
    } catch (error) {
        res.status(500).json({ error: 'Database error', details: error.message });
    }
});

module.exports = router;

