const express = require('express');
const router = express.Router();
const db = require('../../db/db');
const { VALID_STAR_STATUSES } = require('./shared');

// PUT domain.com/api/internal/job/pairnfctag
// Pair an NFC tag ID to a starred job_part for scan-based status updates. Affects: stars table.
router.put('/pairnfctag', async (req, res) => {
    const { jobPartId, nfcTagId } = req.body;
    if (!jobPartId || !nfcTagId) {
        return res.status(400).json({ error: 'jobPartId and nfcTagId are required' });
    }
    try {
        await db.execute(
            `UPDATE stars SET nfc_tag_id = ? WHERE job_part_id = ?`,
            [nfcTagId, jobPartId]
        );
        res.status(200).json({ message: 'NFC tag paired successfully' });
    } catch (e) {
        if (e.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'This NFC tag is already paired to another part.' });
        }
        console.error(e);
        res.status(500).json({ error: 'Failed to pair NFC tag' });
    }
});

// PUT domain.com/api/internal/job/unpairnfctag
// Clear the NFC tag association from a starred job_part. Affects: stars table.
router.put('/unpairnfctag', async (req, res) => {
    const { jobPartId } = req.body;
    if (!jobPartId) {
        return res.status(400).json({ error: 'jobPartId is required' });
    }
    try {
        await db.execute(
            `UPDATE stars SET nfc_tag_id = NULL WHERE job_part_id = ?`,
            [jobPartId]
        );
        res.status(200).json({ message: 'NFC tag disconnected' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to disconnect NFC tag' });
    }
});

// PUT domain.com/api/internal/job/updatestarstatusbynfctag
// Update the production status of a starred job_part identified by its NFC tag. Affects: stars table.
router.put('/updatestarstatusbynfctag', async (req, res) => {
    const { nfcTagId, status } = req.body;
    if (!nfcTagId || !status || !VALID_STAR_STATUSES.includes(status)) {
        return res.status(400).json({ error: 'Invalid parameters' });
    }
    try {
        const [rows] = await db.execute(
            `SELECT id FROM stars WHERE nfc_tag_id = ?`,
            [nfcTagId]
        );
        if (!rows.length) {
            return res.status(404).json({ error: 'No starred part found for this NFC tag' });
        }
        await db.execute(
            `UPDATE stars SET status = ? WHERE nfc_tag_id = ?`,
            [status, nfcTagId]
        );
        res.status(200).json({ message: 'Status updated via NFC tag' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to update status' });
    }
});

module.exports = router;
