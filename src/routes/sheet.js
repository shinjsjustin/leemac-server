// const express = require('express');
// const router = express.Router();
// const db = require('../db/db')

// const {GoogleSpreadsheet} = require('google-spreadsheet')
// const {JWT} = require('google-auth-library')

// const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
// const SHEET_ID = process.env.SHEET_ID;
// const CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL;
// const PRIVATE_KEY = process.env.GOOGLE_SERVICE_PRIVATE_KEY.replace(/\\n/g, '\n'); // Handle line breaks in private key

// const serviceAccountAuth = new JWT({
//     email: CLIENT_EMAIL,
//     key: PRIVATE_KEY,
//     scopes: ['https://www.googleapis.com/auth/spreadsheets'],
// });

// const doc = new GoogleSpreadsheet(SPREADSHEET_ID, serviceAccountAuth);

// //ie: http://localhost:3001/sheet?row=3&column=A
// router.get('/', async(req, res)=>{
//     const row = req.query.row;
//     const column = req.query.column;
//     console.log('row: ', row, ', column: ', column)
//     try{
//         await doc.loadInfo();
//         const sheet = doc.sheetsById[SHEET_ID];
//         await sheet.loadCells('A1:E10')
//         const cell = sheet.getCell(row, column);
//         res.status(200).json({info: cell.value});
//     }catch(e){
//         console.error(e)
//         res.status(500).json(e);
//     }
// })

// router.post('/update', async(req, res)=>{
//     const row = req.body.row;
//     const column = req.body.column;
//     const value = req.body.value;
//     console.log('row: ', row, ', column: ', column, ', value: ', value)
//     try{
//         await doc.loadInfo();
//         const sheet = doc.sheetsById[SHEET_ID];
//         await sheet.loadCells('A1:E10')

//         const cell = sheet.getCell(row, column);
//         cell.value = value

//         await sheet.saveUpdatedCells();

//         res.status(200).json({update: cell.value});
//     }catch(e){
//         console.error(e)
//         res.status(500).json(e);
//     }
// })

// module.exports = router;