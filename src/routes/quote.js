const express = require('express');
const multer = require('multer');
const path = require('path')
const router = express.Router();
const db = require('../db/db');

// const upload = multer({ limits: { fileSize: 5 * 1024 * 1024 } }); // Limit: 5 MB
const upload = multer({ storage: multer.memoryStorage() });
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

router.post('/upload-file', upload.array('files'), async(req, res) => {
    const files = req.files;
    if(!files){
        return res.status(400).json({error: 'No files uploaded'});
    }
    const fileName = files[0].originalname;
    const mimetype = files[0].mimetype;
    const buffer = files[0].buffer;
    const size = files[0].size;
    // console.log('\nfilename: ', fileName);
    // console.log('\nmime: ', mimetype);
    // console.log('\nsize: ', size);
    // console.log('\nbuffer : \n\n', buffer, '\n\n');
    try{
        const [result] = await db.execute('INSERT INTO uploaded_files (filename, mimetype, size, content) VALUES (?,?,?,?)', [fileName, mimetype, size, buffer]);
        
        res.status(201).json({id: result.insertId})
    }catch(e){
        return res.status(500).json({error: e});
    }
})

router.post('/join', async(req, res) => {
    const qrID = req.body.qrID;
    const fileID = req.body.fileID;
    // console.log('qrID: ', qrID, ' | fileID: ', fileID);
    try{
        await db.execute('INSERT INTO qr_file (qrID, fileID) VALUES (?, ?)', [qrID, fileID]);
        res.status(200).json({message: 'ok!'})
    }catch(e){
        return res.status(500).json({error: e})
    }
})

module.exports = router;