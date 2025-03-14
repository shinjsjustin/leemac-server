const db = require('../db/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');

const express = require('express');
const router = express.Router();

const quoteRequests = require('./quoteRequest')

router.use('/requests', quoteRequests);

const upload = multer({ storage: multer.memoryStorage() });

router.post('/newpart', async(req,res)=>{
    let {number, description, unitPrice, company} = req.body;

    try{
        const [result] = await db.execute(
            `INSERT INTO part (number, description, price, company) VALUES (?, ?, ?, ?)`,
            [number, description, unitPrice, company]
        );
        res.status(201).json({id: result.insertId})
    }catch(e){
        console.error(e);
        res.status(409).json({error: 'Server error when creating new request'})
    }
})

router.post('/uploadblob', upload.array('files'), async(req, res)=>{
    console.log('there sure is a message received!')
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
    const { number, description, company } = req.query;

    let query = `
        SELECT id, number, description, price, company
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

    if (company) {
        conditions.push(`company LIKE ?`);
        queryParams.push(`%${company}%`);
    }

    if (conditions.length > 0) {
        query += ` WHERE ${conditions.join(' AND ')}`;
    }

    console.log('Query:', query);
    console.log('Params:', queryParams);

    try {
        const [rows] = await db.execute(query, queryParams);
        if (rows.length > 0) {
            res.status(200).json(rows);
        } else {
            res.status(404).json({ error: 'No results found' });
        }
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Internal server error' });
    }
});


router.get('/getblob', async (req, res) => {
    const partID = req.query.partID;
    try{
        const [rows] = await db.execute('SELECT id, filename, mimetype, size, content, uploaded_at FROM uploaded_files WHERE part_id = ?', [partID]);
        res.status(200).json(rows);
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

module.exports = router;