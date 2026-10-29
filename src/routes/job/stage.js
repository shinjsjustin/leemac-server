const express = require('express');
const router = express.Router();
const db = require('../../db/db');
const { VALID_STAR_STATUSES } = require('./shared');
const { changeStarStatus, setStarFlag } = require('../../lib/starHistory');
const { stageOf, stageLabel } = require('../../lib/shopStages');

const STAR_FLAGS = ['urgent', 'waiting'];
const SETTABLE_STATUSES = VALID_STAR_STATUSES.filter((s) => !STAR_FLAGS.includes(s));

async function moveStar(jobPartId, status, res) {
    try {
        const [rows] = await db.execute('SELECT status FROM stars WHERE job_part_id = ?', [jobPartId]);
        if (!rows[0]) return res.status(404).json({ error: 'No starred part found for that job part' });

        const previous = rows[0].status;
        const { changed } = await changeStarStatus(db, { jobPartId }, status, 'admin');
        const { key, label } = stageLabel(stageOf(status));
        return res.status(200).json({ jobPartId, status, previous, changed, stage: { key, label } });
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: 'Failed to change star stage' });
    }
}

// PUT domain.com/api/internal/job/setstarstage
// Set a starred part's stage status (urgent/waiting are flags). Affects: stars, star_status_history.
router.put('/setstarstage', (req, res) => {
    const { jobPartId, status } = req.body;
    if (!jobPartId || !SETTABLE_STATUSES.includes(status)) {
        return res.status(400).json({ error: 'Invalid job part ID or status' });
    }
    return moveStar(jobPartId, status, res);
});

// POST domain.com/api/internal/job/finishpart
// Finish = stage Done; the star stays until the invoice is paid. Affects: stars, star_status_history.
router.post('/finishpart', (req, res) => {
    const { jobPartId } = req.body;
    if (!jobPartId) return res.status(400).json({ error: 'Job Part ID is required' });
    return moveStar(jobPartId, 'done', res);
});

// PUT domain.com/api/internal/job/setstarflag
// Turn the urgent or waiting flag on or off. Affects: stars, star_status_history.
router.put('/setstarflag', async (req, res) => {
    const { jobPartId, flag, on } = req.body;
    if (!jobPartId || !STAR_FLAGS.includes(flag) || typeof on !== 'boolean') {
        return res.status(400).json({ error: 'Invalid job part ID, flag or on' });
    }

    try {
        const [rows] = await db.execute(`SELECT ${flag} AS value FROM stars WHERE job_part_id = ?`, [jobPartId]);
        if (!rows[0]) return res.status(404).json({ error: 'No starred part found for that job part' });

        const { changed } = await setStarFlag(db, { jobPartId }, flag, on, 'admin');
        return res.status(200).json({ jobPartId, flag, on, previous: Boolean(rows[0].value), changed });
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: 'Failed to set star flag' });
    }
});

module.exports = router;
