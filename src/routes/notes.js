const express = require('express');
const defaultDb = require('../db/db');
const multer = require('multer');

const upload = multer({ storage: multer.memoryStorage() });

const AUTHOR_SQL = 'COALESCE(note.client_name, admin.name)';
const IS_CLIENT_SQL = 'CASE WHEN note.client_name IS NULL THEN 0 ELSE 1 END';
const SORT_COLUMNS = { created_at: 'note.created_at', author: 'author', job_number: 'job.job_number' };
const SHARED_VALUES = [true, false, 0, 1];

function createNotesRouter({ db = defaultDb } = {}) {
const router = express.Router();

// POST domain.com/api/internal/notes/newnote
// Create a new note for a job (optionally on one of its parts, optionally shared), linked to an admin user. Affects: note table.
router.post('/newnote', async (req, res) => {
    const { content, userid, jobid, partid = null, shared = false } = req.body;
    if (!content || !userid || !jobid) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    if (!SHARED_VALUES.includes(shared)) {
        return res.status(400).json({ error: 'Invalid shared value' });
    }
    try {
        const [result] = await db.execute(
            'INSERT INTO note (content, userid, jobid, part_id, shared) VALUES (?, ?, ?, ?, ?)',
            [content, userid, jobid, partid, shared ? 1 : 0]
        );
        res.status(201).json({ id: result.insertId, message: 'Note created successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Database error', details: error.message });
    }
});

// PUT domain.com/api/internal/notes/share
// Share or unshare an admin note with the client. Client notes are always visible. Affects: note table.
router.put('/share', async (req, res) => {
    const { id, shared } = req.body;
    if (!id || !SHARED_VALUES.includes(shared)) {
        return res.status(400).json({ error: 'Missing or invalid fields' });
    }
    try {
        const [notes] = await db.execute('SELECT client_name FROM note WHERE id = ?', [id]);
        if (notes.length === 0) {
            return res.status(404).json({ error: 'Note not found' });
        }
        if (notes[0].client_name !== null) {
            return res.status(400).json({ error: 'Client notes are always visible' });
        }
        await db.execute('UPDATE note SET shared = ? WHERE id = ?', [shared ? 1 : 0, id]);
        res.json({ ok: true, shared });
    } catch (error) {
        res.status(500).json({ error: 'Database error', details: error.message });
    }
});

// DELETE domain.com/api/internal/notes/delete
// Delete a note by ID. Affects: note table.
router.delete('/delete', async (req, res) => {
    const { id } = req.body;
    if (!id) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    try {
        const [result] = await db.execute(
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

// GET domain.com/api/internal/notes/getnote
// Get all notes for a job by job ID, joined with the admin's name and linked part number. Reads: note, admin, part tables.
router.get('/getnote', async (req, res) => {
    const { jobid } = req.query;
    if (!jobid) {
        return res.status(400).json({ error: 'Missing job ID' });
    }
    try {
        const [notes] = await db.execute(
            `SELECT note.id, note.content, note.created_at, ${AUTHOR_SQL} AS author,
                    ${IS_CLIENT_SQL} AS is_client, note.shared,
                    part.number AS part_number
             FROM note 
             JOIN admin ON note.userid = admin.id 
             LEFT JOIN part ON part.id = note.part_id
             WHERE note.jobid = ?`,
            [jobid]
        );
        res.json(notes);
    } catch (error) {
        res.status(500).json({ error: 'Database error', details: error.message });
    }
});

// GET domain.com/api/internal/notes/getrecentnote
// Get the most recently created note for a job by job ID. Reads: note, admin tables.
router.get('/getrecentnote', async (req, res) => {
    const { jobid } = req.query;
    if (!jobid) {
        return res.status(400).json({ error: 'Missing job ID' });
    }
    try {
        const [notes] = await db.execute(
            `SELECT note.id, note.content, note.created_at, ${AUTHOR_SQL} AS author,
                    ${IS_CLIENT_SQL} AS is_client, note.shared
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

// GET domain.com/api/internal/notes/listnotes
// Get all notes across all jobs with admin name and job number, sortable by field/order.
// Reads: note, admin, job, part tables.
router.get('/listnotes', async (req, res) => {
    const { sortBy = 'created_at', order = 'asc' } = req.query;
    const validOrder = ['asc', 'desc'];

    if (!Object.hasOwn(SORT_COLUMNS, sortBy) || !validOrder.includes(order)) {
        return res.status(400).json({ error: 'Invalid sorting criteria' });
    }

    try {
        const [notes] = await db.execute(
            `SELECT note.id, note.content, note.jobid, note.userid, note.part_id, part.number AS part_number,
                    ${AUTHOR_SQL} AS author, ${IS_CLIENT_SQL} AS is_client, note.shared,
                    job.job_number, note.created_at
             FROM note
             JOIN admin ON note.userid = admin.id
             LEFT JOIN job ON note.jobid = job.id
             LEFT JOIN part ON note.part_id = part.id
             ORDER BY ${SORT_COLUMNS[sortBy]} ${order.toUpperCase()}`
        );
        res.json(notes);
    } catch (error) {
        res.status(500).json({ error: 'Database error', details: error.message });
    }
});

// POST domain.com/api/internal/notes/uploadblob
// Upload a file attachment and link it to a specific note by note ID. Affects: uploaded_files table.
router.post('/uploadblob', upload.array('files'), async(req, res)=>{
    const files = req.files;
    const id = req.query.id;
    if(!files){
        return res.status(400).json({error: 'No Files Uploaded'});
    }

    if(!id){
        return res.status(400).json({error: 'No Id Provided'})
    }

    const fileName = files[0].originalname;
    const mimetype = files[0].mimetype;
    const buffer = files[0].buffer;
    const size = files[0].size;

    try{
        const [result] = await db.execute(
            'INSERT INTO uploaded_files (filename, mimetype, size, content, note_id) VALUES (?,?,?,?,?)', 
            [fileName, mimetype, size, buffer, id]
        );
        
        res.status(201).json({id: result.insertId})
    }catch(e){
        return res.status(500).json({error: e});
    }
});

// GET domain.com/api/internal/notes/getblob
// Get all file attachments (as base64) linked to a specific note. Reads: uploaded_files table.
router.get('/getblob', async (req, res) => {
    const noteID = req.query.noteID;
    try{
        const [files] = await db.execute('SELECT id, filename, mimetype, size, content, uploaded_at FROM uploaded_files WHERE note_id = ?', [noteID]);
        const processedFiles = files.map(file => ({
            id: file.id,
            filename: file.filename,
            mimetype: file.mimetype,
            size: file.size,
            content: file.content.toString('base64'), // Proper base64 encoding
        }));
        res.status(200).json(processedFiles);
    }catch(e){
        console.error(e);
        res.status(500).json({error: e});
    }
});

return router;
}

module.exports = createNotesRouter();
module.exports.createNotesRouter = createNotesRouter;
