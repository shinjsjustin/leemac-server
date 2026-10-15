const express = require('express');
const router = express.Router();
const db = require('../db/db')
const { populateSheet } = require('../lib/quoteSheet')

const {GoogleSpreadsheet} = require('google-spreadsheet')
const {JWT} = require('google-auth-library')

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const SHEET_ID = process.env.SHEET_ID;
const CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL;
const PRIVATE_KEY = (process.env.GOOGLE_SERVICE_PRIVATE_KEY || '').replace(/\\n/g, '\n'); // Handle line breaks in private key

const serviceAccountAuth = new JWT({
    email: CLIENT_EMAIL,
    key: PRIVATE_KEY,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const doc = new GoogleSpreadsheet(SPREADSHEET_ID, serviceAccountAuth);

//ie: http://localhost:3000/sheet?row=3&column=A
router.get('/', async(req, res)=>{
    const row = req.query.row;
    const column = req.query.column;
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

router.post('/clear', async (req, res) => {
    try {
        await doc.loadInfo();
        const sheet = doc.sheetsById[SHEET_ID];
        if (!sheet) {
            throw new Error(`Sheet with ID ${SHEET_ID} not found`);
        }

        await sheet.loadCells('B5:B96'); // Adjust range as needed
        for (let row = 4; row < 96; row++) { // Zero-based index for rows
            for (let col = 1; col <= 1; col++) { // Column B is index 1
                const cell = sheet.getCell(row, col);
                cell.value = null;
            }
        }

        await sheet.saveUpdatedCells();
        res.status(200).json({ message: 'Cells cleared successfully' });
    } catch (e) {
        console.error('Error clearing cells:', e.message);
        res.status(500).json({ error: 'Failed to clear cells' });
    }
});

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

        await populateSheet(sheet, job, parts);

        res.status(200).json({ message: 'Google Sheet populated successfully' });
    } catch (e) {
        console.error('Error populating sheet:', e.message);
        res.status(500).json({ error: 'Failed to populate Google Sheet' });
    }
});

module.exports = router;