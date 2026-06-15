const express = require('express');
const router = express.Router();

const partRequests = require('./part');
const jobRequests = require('./job');
const companyRequests = require('./company')
const notesRequests = require('./notes');
const adminsRequests = require('./admins');
const invoiceRequests = require('./invoices');
const expenseRequests = require('./expense');
const financesRequests = require('./finances');
const sheetRequests = require('./sheet');

router.use('/part', partRequests);
router.use('/job', jobRequests);
router.use('/company', companyRequests);
router.use('/notes', notesRequests);
router.use('/admins', adminsRequests);
router.use('/invoices', invoiceRequests);
router.use('/expenses', expenseRequests);
router.use('/finances', financesRequests);
router.use('/sheet', sheetRequests);

module.exports = router;