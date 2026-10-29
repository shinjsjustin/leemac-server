const express = require('express');
const router = express.Router();
const db = require('../../db/db');
const { getAdminOverview } = require('../../lib/adminOverview');
const { getJobStages } = require('../../lib/jobStages');

// GET domain.com/api/internal/job/overview
// Every starred job with its parts, ready to draw. Prices and invoice totals depend on req.user.access.
router.get('/overview', async (req, res) => {
    try {
        res.json(await getAdminOverview(db, req.user.access));
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to load overview' });
    }
});

// GET domain.com/api/internal/job/jobstages?id=
// Stage, flags and last change for every part of one job, starred or not.
router.get('/jobstages', async (req, res) => {
    const { id } = req.query;
    if (!id) {
        return res.status(400).json({ error: 'Job ID is required' });
    }
    try {
        res.json({ stages: await getJobStages(db, id) });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to load job stages' });
    }
});

module.exports = router;
