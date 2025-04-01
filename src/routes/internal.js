const express = require('express');
const router = express.Router();

const partRequests = require('./part');
const jobRequests = require('./job');
const companyRequests = require('./company')

router.use('/part', partRequests);
router.use('/job', jobRequests);
router.use('/company', companyRequests);

module.exports = router;