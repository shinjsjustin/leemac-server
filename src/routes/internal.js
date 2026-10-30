const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/requireRole');

const partRequests = require('./part');
const jobRequests = require('./job');
const companyRequests = require('./company')
const notesRequests = require('./notes');
const adminsRequests = require('./admins');
const invoiceRequests = require('./invoices');
const expenseRequests = require('./expense');
const financesRequests = require('./finances');
const sheetRequests = require('./sheet');
const emailRequests = require('./emails');
const quoteRequestsAdmin = require('./quoteRequestsAdmin');
const adminSearch = require('./adminSearch');
const adminPartLists = require('./adminPartLists');
const printing = require('./printing');

router.use(requireAdmin(1));

router.use('/', adminSearch);
router.use('/part', partRequests);
router.use('/job', jobRequests);
router.use('/company', companyRequests);
router.use('/notes', notesRequests);
router.use('/admins', requireAdmin(3), adminsRequests);
router.use('/invoices', requireAdmin(3), invoiceRequests);
router.use('/expenses', requireAdmin(3), expenseRequests);
router.use('/finances', requireAdmin(3), financesRequests);
router.use('/sheet', requireAdmin(3), sheetRequests);
router.use('/emails', emailRequests);
router.use('/quote-requests', requireAdmin(2), quoteRequestsAdmin);
router.use('/part-lists', requireAdmin(2), adminPartLists);
router.use('/', printing);

module.exports = router;