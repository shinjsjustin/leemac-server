const express = require('express');
const router = express.Router();

// Job routes are split by concern into topical sub-routers. Every sub-router is
// mounted at the ROOT path ('/') so each endpoint keeps its original path under
// /api/internal/job/* exactly as it was in the pre-split job.js file.
//
// All routes across these files use literal, unique paths (there are no
// parameterized routes such as '/:id'), so no route can shadow another and the
// mount order below has no effect on matching. Order is kept concern-by-concern
// for readability only.
router.use('/', require('./crud'));
router.use('/', require('./parts'));
router.use('/', require('./invoicing'));
router.use('/', require('./stars'));
router.use('/', require('./nfc'));
router.use('/', require('./retrieval'));

module.exports = router;
