const express = require('express');
const router = express.Router();
const db = require('../db/db')

router.get('/', async (req, res)=>{
    try {
        const [rows] = await db.execute('SELECT * FROM company;');
        if (rows.length > 0) {
            res.status(200).json(rows);
        } else {
            res.status(404).json({ error: 'Companies not found.' });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'An error occurred while retrieving the company.' });
    }
})

module.exports = router;