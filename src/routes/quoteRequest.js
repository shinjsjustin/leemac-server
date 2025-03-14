const express = require('express');
const router = express.Router();
const db = require('../db/db');
const path = require('path');
const mime = require('mime');

//url/internal/requests/all
router.get('/all', async (req, res) => {
    const { sortBy, sortDirection, filterStatus, searchTerm } = req.query;
    
    let query = `
            SELECT DISTINCT qr.* 
            FROM quote_request qr 
            LEFT JOIN qr_file qf ON qr.id = qf.qrID 
            LEFT JOIN uploaded_files uf ON qf.fileID = uf.id 
        `;

    let conditions = [];
    if (filterStatus) {
        conditions.push(`qr.status = '${filterStatus}'`);
    }

    if (searchTerm) {
        conditions.push(`uf.filename LIKE '%${searchTerm}%'`);
    }

    if (conditions.length > 0) {
        query += ` WHERE ${conditions.join(' AND ')}`;
    }

    if (sortBy) {
        query += ` ORDER BY qr.${sortBy} ${sortDirection === 'desc' ? 'DESC' : 'ASC'}`;
    }
    console.log('Query: ', query)

    try{
        const [rows] = await db.execute(query);
        if(rows.length > 0){
            res.status(200).json(rows);
        }else{
            res.status(404).json({error: 'no results'});
        }
    }catch(e){
        console.error(e);
        res.status(500).json({error: 'Internal server error'})
    }
});

router.get('/id', async(req, res) => {
    const id = req.query.id;
    try{
        const [rows] = await db.execute(`SELECT * FROM quote_request WHERE id = ${id}`);
        if(rows.length > 0){
            res.status(200).json(rows);
        }else{
            res.status(404).json({error: 'no results'});
        }
    }catch(e){
        console.error(e);
        res.status(500).json({error: 'Internal Server Error'})
    }
})

router.get('/files', async (req, res) =>{
    const id = req.query.quoteID;
    try{
        const [rows] = await db.execute('SELECT * FROM qr_file WHERE qrID = ?', [id]);
        res.status(200).json(rows)
    }catch(e){
        console.error(e);
        res.status(500).json({error: e})
    }
})

router.get('/file', async (req, res) =>{
    const id = req.query.fileID;
    try{
        const [rows] = await db.execute('SELECT filename, mimetype, size, uploaded_at FROM uploaded_files WHERE id = ?', [id]);
        res.status(200).json(rows);
    }catch(e){
        console.error(e);
        res.status(500).json({error: e});
    }
})

router.get('/file/download', async (req, res) => {
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

router.post('/update', async (req, res) => {
    const {id, column, value} = req.body;
    // console.log('update: ', id, column, value)
    //NOTE: probably need to check these values for errors later
    try{
        const response = await db.execute(`UPDATE quote_request SET ${column} = '${value}' WHERE id=${id}`);
        res.status(200).json({message: response[0].info});
    }catch(e){
        console.error(e);
        res.status(500).json({error: 'Internal Server Error'});
    }
})


// router.get('/file/download', async(req,res) => {
//     const id = req.query.fileID;
//     try{
//         const [rows] = await db.execute('SELECT file_path FROM file WHERE id = ?', [id]);
//         if(rows.length > 0){
//             const filePath = rows[0].file_path;
//             const fileName = path.basename(filePath); 
//             const fileMime = mime.getType(filePath); 

//             // console.log('fileName: ', fileName, ', fileMime: ', fileMime);
//             res.set('Access-Control-Allow-Origin', '*'); // Adjust this if you need specific origins
//             res.set('Access-Control-Expose-Headers', '*');

//             res.set('Content-Type', fileMime); 
//             res.set('Content-Disposition', `attachment; filename="${fileName}"`);
//             res.download(path.join(__dirname, '..', filePath)); 
//         }else{
//             res.status(404).json({error: 'file not found'});
//         }
//     }catch(e){
//         console.error(e);
//         res.status(500).json({error: 'Internal Server Error'});
//     }
// })


// app.get('/files/:id', async (req, res) => {
//     const userId = req.user.id; // From authentication middleware
//     const file = await db.query('SELECT * FROM uploaded_files WHERE id = ?', [req.params.id]);

//     if (file && file.owner_id === userId) {
//         res.setHeader('Content-Type', file.mimetype);
//         res.send(file.content);
//     } else {
//         res.status(403).send('Access denied.');
//     }
// });


module.exports = router;