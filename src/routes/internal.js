const express = require('express');
const router = express.Router();

const partRequests = require('./part');
const jobRequests = require('./job');
const companyRequests = require('./company')
const sheetRequests = require('./sheet');

router.use('/part', partRequests);
router.use('/job', jobRequests);
router.use('/company', companyRequests);
router.use('/sheet', sheetRequests);

module.exports = router;