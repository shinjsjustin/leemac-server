const express = require('express');
const router = express.Router();

const partRequests = require('./part');
const jobRequests = require('./job');
const companyRequests = require('./company')
const sheetRequests = require('./sheet');
const notesRequests = require('./notes');
const adminsRequests = require('./admins');
const calendarRequests = require('./google-calendar');
const tasksRequests = require('./tasks');
const invoiceRequests = require('./invoices');
const expenseRequests = require('./expense');
const financesRequests = require('./finances');

router.use('/part', partRequests);
router.use('/job', jobRequests);
router.use('/company', companyRequests);
router.use('/sheet', sheetRequests);
router.use('/notes', notesRequests);
router.use('/admins', adminsRequests);
router.use('/calendar', calendarRequests);
router.use('/tasks', tasksRequests);
router.use('/invoices', invoiceRequests);
router.use('/expenses', expenseRequests);
router.use('/finances', financesRequests);

module.exports = router;