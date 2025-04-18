const express = require('express');
const router = express.Router();
const db = require('../db/db');

router.get('/getcompanies', async (req, res) => {
    try{
        const [companies] = await db.execute(`SELECT * FROM company`);
        if(companies.length === 0){
            return res.status(404).json({error: 'No companies found'});
        }
        res.status(200).json(companies);
    }catch (err){
        console.error('Error fetching companies:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
})

router.get('/getcompanies/:id', async (req, res) => {
    const companyId = req.params.id;
    try {
      const [rows] = await pool.query('SELECT * FROM company WHERE id = ?', [companyId]);
      if (rows.length === 0) {
        return res.status(404).json({ error: 'Company not found' });
      }
      res.status(200).json(rows[0]);
    } catch (err) {
      console.error('Error fetching company:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/createcompany', async (req, res) => {
    const { code, name, address_line1, address_line2 } = req.body;
    try {
        const [result] = await db.execute(
            `INSERT INTO company (code, name, address_line1, address_line2) VALUES (?, ?, ?, ?)`,
            [code, name, address_line1, address_line2]
        );
        res.status(201).json({ message: 'Company created successfully', companyId: result.insertId });
    } catch (err) {
        console.error('Error creating company:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.put('/editcompany/:id', async (req, res) => {
    const companyId = req.params.id;
    const { code, name, address_line1, address_line2 } = req.body;
    try {
        const [result] = await db.execute(
            `UPDATE company SET code = ?, name = ?, address_line1 = ?, address_line2 = ? WHERE id = ?`,
            [code, name, address_line1, address_line2, companyId]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Company not found' });
        }
        res.status(200).json({ message: 'Company updated successfully' });
    } catch (err) {
        console.error('Error updating company:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;