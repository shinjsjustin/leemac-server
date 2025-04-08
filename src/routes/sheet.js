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

    const formatDate = (date) => {
        if (!date) return '—';
        const d = new Date(date);
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const yyyy = d.getFullYear();
        return `${mm}-${dd}-${yyyy}`;
    };

    try {
        // Call the clear route logic before populating
        await doc.loadInfo();
        const sheet = doc.sheetsById[SHEET_ID];
        if (!sheet) {
            throw new Error(`Sheet with ID ${SHEET_ID} not found`);
        }

        await sheet.loadCells('B5:B96');
        for (let row = 4; row < 96; row++) {
            for (let col = 1; col <= 1; col++) {
                const cell = sheet.getCell(row, col);
                cell.value = null;
            }
        }
        await sheet.saveUpdatedCells();

        const updates_yes_tax = [
            { cell: 'B5', value: job.job_number },
            { cell: 'B6', value: job.company_code },
            { cell: 'B9', value: job.company_name },
            { cell: 'B10', value: job.address_line1 },
            { cell: 'B11', value: job.address_line2 },
            { cell: 'B13', value: job.attention },
            { cell: 'B14', value: formatDate(job.created_at) },
            { cell: 'B16', value: job.po_number || '' },
            { cell: 'B17', value: formatDate(job.po_date) },
            { cell: 'B18', value: formatDate(job.due_date) },
            { cell: 'B19', value: 'Y' },
            { cell: 'B20', value: job.tax },
            { cell: 'B23', value: job.invoice_number || '—' },
            { cell: 'B24', value: formatDate(job.invoice_date) },
            { cell: 'B25', value: formatDate(job.invoice_date) },
        ];

        const updates_yes_percent = [
            { cell: 'B5', value: job.job_number },
            { cell: 'B6', value: job.company_code },
            { cell: 'B9', value: job.company_name },
            { cell: 'B10', value: job.address_line1 },
            { cell: 'B11', value: job.address_line2 },
            { cell: 'B13', value: job.attention },
            { cell: 'B14', value: formatDate(job.created_at) },
            { cell: 'B16', value: job.po_number || '' },
            { cell: 'B17', value: formatDate(job.po_date) },
            { cell: 'B18', value: formatDate(job.due_date) },
            { cell: 'B19', value: 'Y' },
            { cell: 'B21', value: tax.tax_percent },
            { cell: 'B23', value: job.invoice_number || '—' },
            { cell: 'B24', value: formatDate(job.invoice_date) },
            { cell: 'B25', value: formatDate(job.invoice_date) },
        ];

        const updates_no = [
            { cell: 'B5', value: job.job_number },
            { cell: 'B6', value: job.company_code },
            { cell: 'B9', value: job.company_name },
            { cell: 'B10', value: job.address_line1 },
            { cell: 'B11', value: job.address_line2 },
            { cell: 'B13', value: job.attention },
            { cell: 'B14', value: formatDate(job.created_at) },
            { cell: 'B16', value: job.po_number || '' },
            { cell: 'B17', value: formatDate(job.po_date) },
            { cell: 'B18', value: formatDate(job.due_date) },
            { cell: 'B19', value: 'N' },
            { cell: 'B23', value: job.invoice_number || '—' },
            { cell: 'B24', value: formatDate(job.invoice_date) },
            { cell: 'B25', value: formatDate(job.invoice_date) },
        ];

        if (job.tax_code === 1 && job.tax > 0) {
            updates_yes_tax.forEach(({ cell, value }) => {
                const [column, row] = [cell[0], parseInt(cell.slice(1), 10)];
                const cellObj = sheet.getCell(row - 1, column.charCodeAt(0) - 65);
                cellObj.value = value;
            });
        } else if (job.tax_code === 1 && job.tax_percent > 0) {
            updates_yes_percent.forEach(({ cell, value }) => {
                const [column, row] = [cell[0], parseInt(cell.slice(1), 10)];
                const cellObj = sheet.getCell(row - 1, column.charCodeAt(0) - 65);
                cellObj.value = value;
            });
        } else {
            updates_no.forEach(({ cell, value }) => {
                const [column, row] = [cell[0], parseInt(cell.slice(1), 10)];
                const cellObj = sheet.getCell(row - 1, column.charCodeAt(0) - 65);
                cellObj.value = value;
            });
        }

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

        updates.forEach(({ cell, value }) => {
            const [column, row] = [cell[0], parseInt(cell.slice(1), 10)];
            const cellObj = sheet.getCell(row - 1, column.charCodeAt(0) - 65);
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