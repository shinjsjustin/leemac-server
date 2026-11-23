const express = require('express');
const router = express.Router();
const db = require('../db/db');

// GET domain.com/api/internal/company/getcompanies
// Retrieve all company records. Reads: company table.
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

// GET domain.com/api/internal/company/getcompanies/:id
// Retrieve a single company record by its ID. Reads: company table.
router.get('/getcompanies/:id', async (req, res) => {
    const companyId = req.params.id;
    try {
      const [rows] = await db.execute('SELECT * FROM company WHERE id = ?', [companyId]);
      if (rows.length === 0) {
        return res.status(404).json({ error: 'Company not found' });
      }
      res.status(200).json(rows[0]);
    } catch (err) {
      console.error('Error fetching company:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
});

// POST domain.com/api/internal/company/createcompany
// Create a new company with code, name, and address lines. Affects: company table.
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

const BILL_TO_FIELDS = ['bill_to_name', 'bill_to_line1', 'bill_to_line2', 'bill_to_line3', 'bill_to_line4', 'bill_to_line5'];
const BILL_TO_MAX_LENGTH = 255;

// Returns the value to store (null when unset), or undefined when invalid.
function normalizeBillTo(value) {
    if (value === null) return null;
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    if (trimmed.length > BILL_TO_MAX_LENGTH) return undefined;
    return trimmed === '' ? null : trimmed;
}

// PUT domain.com/api/internal/company/editcompany/:id
// Update an existing company's code, name, and address lines by ID. Bill-to fields are
// updated only when present in the body. Affects: company table.
router.put('/editcompany/:id', async (req, res) => {
    const companyId = req.params.id;
    const { code, name, address_line1, address_line2 } = req.body;
    const setClauses = ['code = ?', 'name = ?', 'address_line1 = ?', 'address_line2 = ?'];
    const params = [code, name, address_line1, address_line2];
    for (const field of BILL_TO_FIELDS) {
        if (!Object.hasOwn(req.body, field)) continue;
        const value = normalizeBillTo(req.body[field]);
        if (value === undefined) {
            return res.status(400).json({ error: `${field} must be text of at most ${BILL_TO_MAX_LENGTH} characters` });
        }
        setClauses.push(`${field} = ?`);
        params.push(value);
    }
    try {
        const [result] = await db.execute(
            `UPDATE company SET ${setClauses.join(', ')} WHERE id = ?`,
            [...params, companyId]
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