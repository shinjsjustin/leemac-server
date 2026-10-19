const db = require('../db/db');
const express = require('express');
const router = express.Router();
const { requireClient } = require('../middleware/requireRole');
const portal = require('../lib/clientPortal');

router.use(requireClient);

// Ids come from the URL or body; reject anything that is not a plain integer before querying.
const toId = (value) => (/^\d+$/.test(String(value)) ? Number(value) : null);

// Wraps a handler: bad ids give 400, a null result 404, ClientPortalError its status, anything else a generic 500.
function handle(idsOf, run) {
    return async (req, res) => {
        const ids = idsOf(req).map(toId);
        if (ids.some((id) => id === null)) return res.status(400).json({ error: 'Invalid id' });
        try {
            const result = await run(req, res, ...ids);
            if (result === null) return res.status(404).json({ error: 'Not found' });
            if (result !== undefined) res.json(result);
        } catch (error) {
            if (error instanceof portal.ClientPortalError) return res.status(error.status).json({ error: error.message });
            console.error('Client portal error:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    };
}

const none = () => [];
const idParam = (req) => [req.params.id];
const companyOf = (req) => req.user.company_id;

router.get('/starred', handle(none, (req) => portal.listStarred(db, companyOf(req))));
router.get('/jobs', handle(none, (req) => portal.listJobs(db, companyOf(req), req.query)));
router.get('/parts', handle(none, (req) => portal.listParts(db, companyOf(req), req.query)));

router.get('/jobs/:id', handle(idParam, (req, res, id) => portal.getJob(db, companyOf(req), id)));
router.get('/jobs/:id/files', handle(idParam, (req, res, id) => portal.listJobFiles(db, companyOf(req), id)));
router.get('/jobs/:id/notes', handle(idParam, (req, res, id) => portal.listNotes(db, companyOf(req), id)));
router.get('/parts/:id', handle(idParam, (req, res, id) => portal.getPart(db, companyOf(req), id)));
router.get('/parts/:id/files', handle(idParam, (req, res, id) => portal.listPartFiles(db, companyOf(req), id)));

router.get('/files/:id/download', handle(idParam, async (req, res, id) => {
    const file = await portal.getFile(db, companyOf(req), id);
    if (!file) return null;
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    res.setHeader('Content-Type', file.mimetype);
    res.setHeader('Content-Length', file.size);
    res.send(file.content);
}));

router.post('/jobs/:id/notes', handle(idParam, async (req, res, id) => {
    const note = await portal.addClientNote(db, companyOf(req), id, req.user.name, req.body.content);
    res.status(201).json(note);
}));

router.put('/status', handle((req) => [req.body.jobPartId], async (req, res, jobPartId) => {
    await portal.setStarStatus(db, companyOf(req), jobPartId, req.body.status);
    res.json({ message: 'Status updated' });
}));

module.exports = router;
