const express = require('express');
const router = express.Router();
const db = require('../db/db')

router.get('/', async (req, res)=>{
    try {
        const [rows] = await db.execute('SELECT * FROM part;');
        if (rows.length > 0) {
            res.status(200).json(rows);
        } else {
            res.status(404).json({ error: 'Part not found.' });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'An error occurred while retrieving the part.' });
    }
})

router.post('/new', async(req,res)=>{
    const {number, revision, description, quantity, price, finish} = req.body;
    try{
        const [result] = await db.execute(
            `INSERT INTO part (number, revision, description, quantity, unit_price, finish)`,
            [number, revision, description, quantity, price, finish]
        );
        res.status(201).json({id: result.insertId, number})
    }catch(e){
        console.error(e);
        res.status(409).json({error: 'Server error when creating new part'})
    }
})

module.exports = router;