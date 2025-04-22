const express = require('express');
const router = express.Router();
const db = require('../db/db');

// Create a new note
router.post('/newnote', async (req, res) => {
    const { content, userid, jobid } = req.body;
    if (!content || !userid || !jobid) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    try {
        const [result] = await db.query(
            'INSERT INTO note (content, userid, jobid) VALUES (?, ?, ?)',
            [content, userid, jobid]
        );
        res.status(201).json({ id: result.insertId, message: 'Note created successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Database error', details: error.message });
    }
});

// Update the status of a note
router.put('/updatestatus', async (req, res) => {
    const { id, status } = req.body;
    if (!id || !status) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    if (!['new', 'acknowledged', 'done'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status value' });
    }
    try {
        const [result] = await db.query(
            'UPDATE note SET status = ? WHERE id = ?',
            [status, id]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Note not found' });
        }
        res.json({ message: 'Status updated successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Database error', details: error.message });
    }
});

// Delete a note
router.delete('/delete', async (req, res) => {
    const { id } = req.body;
    if (!id) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    try {
        const [result] = await db.query(
            'DELETE FROM note WHERE id = ?',
            [id]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Note not found' });
        }
        res.json({ message: 'Note deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Database error', details: error.message });
    }
});

// Get notes by job ID
router.get('/getnote', async (req, res) => {
    const { jobid } = req.query;
    if (!jobid) {
        return res.status(400).json({ error: 'Missing job ID' });
    }
    try {
        const [notes] = await db.query(
            `SELECT note.id, note.content, note.status, note.created_at, admin.name AS admin_name 
             FROM note 
             JOIN admin ON note.userid = admin.id 
             WHERE note.jobid = ?`,
            [jobid]
        );
        res.json(notes);
    } catch (error) {
        res.status(500).json({ error: 'Database error', details: error.message });
    }
});

// Get the most recent note by job ID
router.get('/getrecentnote', async (req, res) => {
    const { jobid } = req.query;
    if (!jobid) {
        return res.status(400).json({ error: 'Missing job ID' });
    }
    try {
        const [notes] = await db.query(
            `SELECT note.id, note.content, note.status, note.created_at, admin.name AS admin_name 
             FROM note 
             JOIN admin ON note.userid = admin.id 
             WHERE note.jobid = ? 
             ORDER BY note.created_at DESC 
             LIMIT 1`,
            [jobid]
        );
        if (notes.length === 0) {
            return res.status(204).json({ message: `No notes for jobid: ${jobid}` });
        }
        res.json(notes[0]);
    } catch (error) {
        res.status(500).json({ error: 'Database error', details: error.message });
    }
});

// Get a list of all notes with additional details and sorting
router.get('/listnotes', async (req, res) => {
    const { sortBy = 'created_at', order = 'asc' } = req.query;
    const validSortFields = ['created_at', 'status', 'admin_name', 'job_number'];
    const validOrder = ['asc', 'desc'];

    if (!validSortFields.includes(sortBy) || !validOrder.includes(order)) {
        return res.status(400).json({ error: 'Invalid sorting criteria' });
    }

    try {
        const [notes] = await db.query(
            `SELECT note.content, note.status, note.jobid, note.userid, admin.name AS admin_name, job.job_number, note.created_at 
             FROM note 
             JOIN admin ON note.userid = admin.id 
             JOIN job ON note.jobid = job.id 
             ORDER BY ${sortBy} ${order.toUpperCase()}`
        );
        res.json(notes);
    } catch (error) {
        res.status(500).json({ error: 'Database error', details: error.message });
    }
});

module.exports = router;
