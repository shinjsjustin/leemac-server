const express = require('express');
const router = express.Router();

const partRequests = require('./part');
const jobRequests = require('./job');
const companyRequests = require('./company')
const sheetRequests = require('./sheet');
const notesRequests = require('./notes');

router.use('/part', partRequests);
router.use('/job', jobRequests);
router.use('/company', companyRequests);
router.use('/sheet', sheetRequests);
router.use('/notes', notesRequests);

module.exports = router;