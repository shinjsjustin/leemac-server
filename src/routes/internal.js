const express = require('express');
const router = express.Router();
const { requireAdmin, requireAdminForWrites } = require('../middleware/requireRole');

const partRequests = require('./part');
const partPool = require('./partPool');
const jobRequests = require('./job');
const companyRequests = require('./company')
const notesRequests = require('./notes');
const adminsRequests = require('./admins');
const invoiceRequests = require('./invoices');
const expenseRequests = require('./expense');
const financesRequests = require('./finances');
const emailRequests = require('./emails');
const quoteRequestsAdmin = require('./quoteRequestsAdmin');
const adminSearch = require('./adminSearch');
const adminPartLists = require('./adminPartLists');
const printing = require('./printing');
const simpleJobs = require('./simpleJobs');
const qcAdmin = require('./qcAdmin');

router.use(requireAdmin(1));

const WRITE_LEVEL = 3;
// Writes level 1 and 2 may still make: shop floor actions, read-style POSTs and prints.
const LOW_LEVEL_WRITES = [
    ['PUT', '/job/pairnfctag'],
    ['PUT', '/job/unpairnfctag'],
    ['PUT', '/job/updatestarstatusbynfctag'],
    ['PUT', '/job/setstarstage'],
    ['POST', '/job/finishpart'],
    ['PUT', '/job/setstarflag'],
    ['DELETE', '/job/unstarjob'],
    ['POST', '/notes/newnote'],
    ['PUT', '/notes/share'],
    ['POST', '/job/matchjobbyparts'],
    ['POST', '/job/getjobsbypartids'],
    ['POST', '/quote-requests/:id/check'],
    ['POST', '/print'],
    ['POST', '/print/job/drawings'],
    ['POST', '/printers/:id/test'],
];
router.use(requireAdminForWrites(WRITE_LEVEL, LOW_LEVEL_WRITES));

router.use('/', adminSearch);
router.use('/part', partRequests);
router.use('/part', partPool);
router.use('/job', jobRequests);
router.use('/company', companyRequests);
router.use('/notes', notesRequests);
router.use('/admins', requireAdmin(3), adminsRequests);
router.use('/invoices', requireAdmin(3), invoiceRequests);
router.use('/expenses', requireAdmin(3), expenseRequests);
router.use('/finances', requireAdmin(3), financesRequests);
router.use('/emails', emailRequests);
router.use('/quote-requests', requireAdmin(2), quoteRequestsAdmin);
router.use('/part-lists', requireAdmin(2), adminPartLists);
router.use('/', printing);
router.use('/simple', simpleJobs);
// Not in LOW_LEVEL_WRITES: every QC write needs access 3; qcAdmin gates reads at 2.
router.use('/qc', qcAdmin);

module.exports = router;