const express = require('express');
const router = express.Router();
const db = require('../db/db');
const multer = require('multer');

const upload = multer({ storage: multer.memoryStorage() });

router.post('/newpart', async (req, res) => {
    let { number, description, unitPrice, details, rev } = req.body;

    try {
        // Insert new part or ignore if it already exists
        const [result] = await db.execute(
            `INSERT IGNORE INTO part (number, description, price, details, rev) VALUES (?, ?, ?, ?, ?)`,
            [number, description, unitPrice, details, rev]
        );

        if (result.affectedRows === 0) {
            // Part already exists
            const [existingRows] = await db.execute(
                `SELECT id FROM part WHERE number = ?`,
                [number]
            );
            return res.status(200).json({ id: existingRows[0].id, existing: true });
        }

        // Part successfully inserted
        return res.status(201).json({ id: result.insertId, existing: false });
    } catch (e) {
        console.error(e);
        return res.status(409).json({ error: 'Server error when creating new part' });
    }
});


router.post('/updatepart', async (req, res) => {
    const { id, number, description, price, details, rev } = req.body; 

    try {
        await db.execute(
            `UPDATE part SET number = ?, description = ?, price = ?, details = ?, rev = ? WHERE id = ?`, // Updated query
            [number, description, price, details, rev, id] 
        );
        res.status(200).json({ message: 'Part details updated successfully' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Server error when updating part details' });
    }
});

router.get('/getpart', async (req, res) => {
    const { id } = req.query;

    if (!id) {
        return res.status(400).json({ error: 'Part ID is required' });
    }

    try {
        const [rows] = await db.execute(
            `SELECT id, number, description, price, details, rev FROM part WHERE id = ?`,
            [id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Part not found' });
        }

        res.status(200).json(rows[0]);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Server error when fetching part details' });
    }
});


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
            'INSERT INTO uploaded_files (filename, mimetype, size, content, part_id) VALUES (?,?,?,?,?)', 
            [fileName, mimetype, size, buffer, id]
        );
        
        res.status(201).json({id: result.insertId})
    }catch(e){
        return res.status(500).json({error: e});
    }
});

router.get('/getparts', async (req, res) => {
    const { number, description } = req.query;

    let query = `
        SELECT id, number, description, price
        FROM part
    `;

    let conditions = [];
    let queryParams = [];

    if (number) {
        conditions.push(`number LIKE ?`);
        queryParams.push(`%${number}%`);
    }

    if (description) {
        conditions.push(`description LIKE ?`);
        queryParams.push(`%${description}%`);
    }

    if (conditions.length > 0) {
        query += ` WHERE ${conditions.join(' AND ')}`;
    }

    try {
        const [rows] = await db.execute(query, queryParams);
        // console.log('Result:', rows); // Debug log
        res.status(200).json(rows); // Always return JSON
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Internal server error' });
    }
});


router.get('/getblob', async (req, res) => {
    const partID = req.query.partID;
    try{
        const [files] = await db.execute('SELECT id, filename, mimetype, size, content, uploaded_at FROM uploaded_files WHERE part_id = ?', [partID]);
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

router.get('/blob/download', async (req, res) => {
    const id = req.query.fileID;

    try {
        const [fileRows] = await db.query('SELECT * FROM uploaded_files WHERE id = ?', [id]);

        if (fileRows.length === 0) {
            return res.status(404).json({ error: 'File not found' });
        }

        const file = fileRows[0];
        // console.log('\ndonwload filename: ', file.filename);
        // console.log('\ndownload size: ', file.size);
        // console.log('donwload blob: \n\n', file.content,'\n\n');

        res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
        res.setHeader('Content-Type', file.mimetype);
        res.setHeader('Content-Length', file.size);
        res.send(file.content); // Send the file blob
    } catch (error) {
        console.error('Error downloading file:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

router.delete('/deleteblob', async (req, res) => {
    const { fileID } = req.query;
    try {
        await db.execute(
            `DELETE FROM uploaded_files WHERE id = ?`,
            [fileID]
        );
        res.status(200).json({ message: 'File deleted successfully' });
    } catch (error) {
        console.error('Error deleting file:', error);
        res.status(500).json({ message: error });
    }
});

router.delete('/deletepart', async (req, res) => {
    const { id } = req.query;

    if (!id) {
        return res.status(400).json({ error: 'Part ID is required' });
    }

    try {
        // Delete associated files
        await db.execute('DELETE FROM uploaded_files WHERE part_id = ?', [id]);

        // Delete the part
        await db.execute('DELETE FROM part WHERE id = ?', [id]);

        res.status(200).json({ message: 'Part and associated files deleted successfully' });
    } catch (error) {
        console.error('Error deleting part:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;