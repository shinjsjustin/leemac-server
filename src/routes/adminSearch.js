const express = require('express');
const db = require('../db/db');
const { searchAdmin } = require('../lib/adminSearch');
const { getBadges } = require('../lib/adminBadges');

const router = express.Router();
const HTTP_SERVER_ERROR = 500;

const handle = (run) => async (req, res) => {
    try {
        res.json(await run(req));
    } catch (error) {
        console.error(error);
        res.status(HTTP_SERVER_ERROR).json({ error: 'Internal server error' });
    }
};

router.get('/search', handle((req) => searchAdmin(db, req.query.q, req.user.access)));
router.get('/badges', handle((req) => getBadges(db, req.user.access)));

module.exports = router;
