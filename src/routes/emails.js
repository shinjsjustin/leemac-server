const express = require('express');
const { EmailLinkError, addEmailLinks, listEmailLinks, removeEmailLink } = require('../lib/emailLinks');

const HTTP_CREATED = 201;
const HTTP_BAD_REQUEST = 400;
const HTTP_SERVER_ERROR = 500;

const toId = (v) => (/^\d+$/.test(String(v ?? '')) && Number(v) > 0 ? Number(v) : null);

function createEmailRoutes({ db = require('../db/db') } = {}) {
    const router = express.Router();

    const fail = (res, e, message) => {
        if (e instanceof EmailLinkError) return res.status(e.status).json({ error: e.message });
        console.error(e);
        res.status(HTTP_SERVER_ERROR).json({ error: message });
    };

    router.get('/', async (req, res) => {
        const { jobId, partId } = req.query;
        if ((jobId === undefined) === (partId === undefined)) {
            return res.status(HTTP_BAD_REQUEST).json({ error: 'Exactly one of jobId or partId is required' });
        }
        const id = toId(jobId ?? partId);
        if (id === null) return res.status(HTTP_BAD_REQUEST).json({ error: 'jobId or partId must be a positive integer' });
        try {
            const target = jobId !== undefined ? { jobId: id } : { partId: id };
            res.json({ emails: await listEmailLinks(db, target) });
        } catch (e) {
            fail(res, e, 'Failed to list email links');
        }
    });

    router.post('/add', async (req, res) => {
        try {
            res.status(HTTP_CREATED).json(await addEmailLinks(db, [req.body], { createdBy: 'admin' }));
        } catch (e) {
            fail(res, e, 'Failed to add email link');
        }
    });

    router.post('/remove', async (req, res) => {
        const id = (req.body || {}).id;
        if (!Number.isInteger(id) || id < 1) {
            return res.status(HTTP_BAD_REQUEST).json({ error: 'id must be a positive integer' });
        }
        try {
            await removeEmailLink(db, id);
            res.json({ id });
        } catch (e) {
            fail(res, e, 'Failed to remove email link');
        }
    });

    return router;
}

module.exports = createEmailRoutes();
module.exports.createEmailRoutes = createEmailRoutes;
