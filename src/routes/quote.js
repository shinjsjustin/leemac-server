const express = require('express');
const multer = require('multer');
const path = require('path')
const router = express.Router();
const db = require('../db/db');

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'test/');
    },
    filename: (req, file, cb) =>{
        const originalName = file.originalname;
        const timestamp = Date.now();
        cb(null, `${timestamp}-${originalName}`);
    }
});

const upload = multer({storage: storage});

router.post('/file', upload.array('files'), async (req, res) => {
    try{
        const files = req.files;
        const quoteID = req.body.quoteID;

        if(!files){
            return res.status(400).json({error: 'No files uploaded'});
        }
        if(!quoteID){
            return res.status(400).json({error: 'Quote Id is required'});
        }
        const filePaths = files.map(file => file.path);
        for(let filePath of filePaths){
            await db.execute('INSERT INTO file (file_path, quoteID) VALUES (?,?)', [filePath, quoteID]);
        }
        res.status(200).json({message: 'Files uploaded successfully', filePaths})
    }catch(e){
        console.error(e)
        res.status(500).json({error: 'Error uploading files'})
    }
})

router.post('/new', async(req,res)=>{
    let {name, email, phoneValue, description, title} = req.body;
    phoneValue = phoneValue ? phoneValue : null;

    try{
        const [result] = await db.execute(
            `INSERT INTO quote_request (name, email, phone, description, title) VALUES (?,?,?,?,?)`,
            [name, email, phoneValue, description, title]
        );
        res.status(201).json({id: result.insertId})
    }catch(e){
        console.error(e);
        res.status(409).json({error: 'Server error when creating new request'})
    }
})

module.exports = router;