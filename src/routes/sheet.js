const express = require('express');
const router = express.Router();
const db = require('../db/db')

const {GoogleSpreadsheet} = require('google-spreadsheet')
const {JWT} = require('google-auth-library')

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const SHEET_ID = process.env.SHEET_ID;
const CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL;
const PRIVATE_KEY = process.env.GOOGLE_SERVICE_PRIVATE_KEY.replace(/\\n/g, '\n'); // Handle line breaks in private key

const serviceAccountAuth = new JWT({
    email: CLIENT_EMAIL,
    key: PRIVATE_KEY,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const doc = new GoogleSpreadsheet(SPREADSHEET_ID, serviceAccountAuth);

//ie: http://localhost:3001/sheet?row=3&column=A
router.get('/', async(req, res)=>{
    const row = req.query.row;
    const column = req.query.column;
    console.log('row: ', row, ', column: ', column); // Debug log
    try{
        await doc.loadInfo();
        const sheet = doc.sheetsById[SHEET_ID];
        if (!sheet) {
            throw new Error(`Sheet with ID ${SHEET_ID} not found`);
        }
        await sheet.loadCells('A1:E10')
        const cell = sheet.getCell(row, column);
        res.status(200).json({info: cell.value});
    }catch(e){
        console.error('Error loading sheet or cell:', e.message); // Improved error log
        res.status(500).json({ error: e.message });
    }
})

router.post('/update', async(req, res)=>{
    const row = req.body.row;
    const column = req.body.column;
    const value = req.body.value;
    console.log('row: ', row, ', column: ', column, ', value: ', value); // Debug log
    try{
        await doc.loadInfo();
        const sheet = doc.sheetsById[SHEET_ID];
        if (!sheet) {
            throw new Error(`Sheet with ID ${SHEET_ID} not found`);
        }
        await sheet.loadCells('A1:E10')

        const cell = sheet.getCell(row, column);
        cell.value = value

        await sheet.saveUpdatedCells();

        res.status(200).json({update: cell.value});
    }catch(e){
        console.error('Error updating sheet or cell:', e.message); // Improved error log
        res.status(500).json({ error: e.message });
    }
})

router.post('/populate', async (req, res) => {
    const { job, parts } = req.body;

    if (!job || !parts) {
        return res.status(400).json({ error: 'Missing job or parts data' });
    }

    try {
        await doc.loadInfo();
        const sheet = doc.sheetsById[SHEET_ID];
        if (!sheet) {
            throw new Error(`Sheet with ID ${SHEET_ID} not found`);
        }

        const updates = [
            { cell: 'B5', value: job.job_number },
            { cell: 'B6', value: job.company_code },
            { cell: 'B9', value: job.company_name },
            { cell: 'B10', value: job.address_line1 },
            { cell: 'B11', value: job.address_line2 },
            { cell: 'B13', value: job.attention },
            { cell: 'B14', value: job.created_at.slice(0, 10) },
            { cell: 'B16', value: job.po_number || '—' },
            { cell: 'B17', value: job.po_date || '—' },
            { cell: 'B18', value: job.due_date || '—' },
            { cell: 'B19', value: job.tax_code || 'N' },
            { cell: 'B20', value: job.tax || 0 },
            { cell: 'B21', value: job.tax_percent || 0 },
            { cell: 'B23', value: job.invoice_number || '—' },
            { cell: 'B24', value: job.invoice_date || '—' },
            { cell: 'B25', value: job.invoice_date || '—' },
        ];

        parts.forEach((part, index) => {
            const startRow = 27 + index * 7;
            updates.push(
                { cell: `B${startRow}`, value: part.number },
                { cell: `B${startRow + 1}`, value: part.rev || '—' },
                { cell: `B${startRow + 2}`, value: part.description || '—' },
                { cell: `B${startRow + 3}`, value: part.details },
                { cell: `B${startRow + 4}`, value: part.quantity },
                { cell: `B${startRow + 5}`, value: part.price }
            );
        });

        await sheet.loadCells('B5:B96'); // Adjust range as needed
        updates.forEach(({ cell, value }) => {
            const [column, row] = [cell[0], parseInt(cell.slice(1), 10)];
            const cellObj = sheet.getCell(row - 1, column.charCodeAt(0) - 65); // Convert to zero-based indices
            cellObj.value = value;
        });

        await sheet.saveUpdatedCells();

        res.status(200).json({ message: 'Google Sheet populated successfully' });
    } catch (e) {
        console.error('Error populating sheet:', e.message);
        res.status(500).json({ error: 'Failed to populate Google Sheet' });
    }
});

module.exports = router;