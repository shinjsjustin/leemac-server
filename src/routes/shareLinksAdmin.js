const express = require('express');
const defaultDb = require('../db/db');
const { requireAdmin } = require('../middleware/requireRole');
const shareLinks = require('../lib/shareLinks');

const ID_PATTERN = /^[1-9]\d{0,9}$/;
const READ_LEVEL = 2;
const WRITE_LEVEL = 3;
const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;
const NOT_FOUND = { error: 'Not found' };
const LINK_FIELDS = ['id', 'token', 'expires_at', 'open_count', 'last_opened_at'];

const toLink = (row) => (row ? Object.fromEntries(LINK_FIELDS.map((f) => [f, row[f]])) : null);

// Wraps a handler: ShareLinkError keeps its status, anything else is a generic 500.
function handle(run) {
    return async (req, res) => {
        try {
            res.json(await run(req));
        } catch (error) {
            if (error instanceof shareLinks.ShareLinkError) {
                return res.status(error.status).json({ error: error.message });
            }
            console.error('Admin share link error:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    };
}

async function hasQuote(db, jobId) {
    const [rows] = await db.execute("SELECT id FROM job_document WHERE job_id = ? AND type = 'quote' LIMIT 1", [jobId]);
    return rows.length > 0;
}

function createShareLinksAdminRouter({ db = defaultDb } = {}) {
    const router = express.Router();

    router.use((req, res, next) => {
        res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
        next();
    });

    router.get('/', requireAdmin(READ_LEVEL), handle(async (req) => {
        const { type, target_id: targetId, company_id: companyId } = req.query;
        const isValid = ['quote', 'qc'].includes(type) && ID_PATTERN.test(targetId)
            && (type === 'quote' || ID_PATTERN.test(companyId));
        if (!isValid) throw new shareLinks.ShareLinkError(HTTP_BAD_REQUEST, 'Invalid type, target_id or company_id');
        const row = await shareLinks.getLink(db, type, Number(targetId), Number(companyId));
        return { link: toLink(row), ready: type === 'qc' || (await hasQuote(db, Number(targetId))) };
    }));

    router.get('/companies', requireAdmin(READ_LEVEL), handle(async (req) => {
        if (!ID_PATTERN.test(req.query.part_id)) throw new shareLinks.ShareLinkError(HTTP_BAD_REQUEST, 'Invalid part_id');
        return { companies: await shareLinks.companiesForPart(db, Number(req.query.part_id)) };
    }));

    router.post('/', requireAdmin(WRITE_LEVEL), handle(async (req) => {
        // Admin tokens carry no name, so read it from the admin row.
        const [admins] = await db.execute('SELECT name FROM admin WHERE id = ?', [req.user.id]);
        const row = await shareLinks.createLink(db, { id: req.user.id, name: admins[0]?.name || req.user.email }, req.body);
        return { link: toLink(row) };
    }));

    router.post('/:id/turn-off', requireAdmin(WRITE_LEVEL), handle(async (req) => {
        const notFound = new shareLinks.ShareLinkError(HTTP_NOT_FOUND, NOT_FOUND.error);
        if (!ID_PATTERN.test(req.params.id)) throw notFound;
        const id = Number(req.params.id);
        const [rows] = await db.execute('SELECT id FROM share_link WHERE id = ?', [id]);
        if (rows.length === 0) throw notFound;
        await shareLinks.turnOff(db, id);
        return { ok: true };
    }));

    router.use((req, res) => res.status(HTTP_NOT_FOUND).json(NOT_FOUND));

    return router;
}

module.exports = createShareLinksAdminRouter();
module.exports.createShareLinksAdminRouter = createShareLinksAdminRouter;
