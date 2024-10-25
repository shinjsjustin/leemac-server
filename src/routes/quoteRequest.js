const express = require('express');
const router = express.Router();
const db = require('../db/db');
const path = require('path');
const mime = require('mime')

//url/admin/requests/all
router.get('/all', async (req, res) => {
    const { sortBy, sortDirection, filterStatus } = req.query;
    
    let query = 'SELECT * FROM quote_request';

    if (filterStatus) {
        query += ` WHERE status = '${filterStatus}'`;
    }

    if (sortBy) {
        query += ` ORDER BY ${sortBy} ${sortDirection === 'desc' ? 'DESC' : 'ASC'}`;
    }
    // console.log('Query: ', query)

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

router.get('/file', async (req, res) =>{
    const id = req.query.quoteID;
    try{
        const [rows] = await db.execute('SELECT * FROM file WHERE quoteID = ?', [id]);
        res.status(200).json(rows)
    }catch(e){
        console.error(e);
        res.status(500).json({error: e})
    }
})

router.get('/file/download', async(req,res) => {
    const id = req.query.fileID;
    try{
        const [rows] = await db.execute('SELECT file_path FROM file WHERE id = ?', [id]);
        if(rows.length > 0){
            const filePath = rows[0].file_path;
            const fileName = path.basename(filePath); 
            const fileMime = mime.getType(filePath); 

            // console.log('fileName: ', fileName, ', fileMime: ', fileMime);
            res.set('Access-Control-Allow-Origin', '*'); // Adjust this if you need specific origins
            res.set('Access-Control-Expose-Headers', '*');

            res.set('Content-Type', fileMime); 
            res.set('Content-Disposition', `attachment; filename="${fileName}"`);
            res.download(path.join(__dirname, '..', filePath)); 
        }else{
            res.status(404).json({error: 'file not found'});
        }
    }catch(e){
        console.error(e);
        res.status(500).json({error: 'Internal Server Error'});
    }
})

router.get('/', async (req, res)=>{
    try {
        const [rows] = await db.execute('SELECT * FROM quote_request;');
        if (rows.length > 0) {
            res.status(200).json(rows);
        } else {
            res.status(404).json({ error: 'Quote not found.' });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'An error occurred while retrieving the Quote.' });
    }
})

router.post('/update', async (req, res) => {
    const {id, column, value} = req.body;
    console.log('update: ', id, column, value)
    //NOTE: probably need to check these values for errors later
    try{
        const response = await db.execute(`UPDATE quote_request SET ${column} = '${value}' WHERE id=${id}`);
        res.status(200).json({message: response[0].info});
    }catch(e){
        console.error(e);
        res.status(500).json({error: 'Internal Server Error'});
    }
})

module.exports = router;