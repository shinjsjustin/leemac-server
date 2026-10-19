const { EmailLinkError, addEmailLinks } = require('../../../lib/emailLinks');

const HTTP_CREATED = 201;
const HTTP_BAD_REQUEST = 400;
const HTTP_SERVER_ERROR = 500;

function registerEmailRoutes(router, { db }) {
    router.post('/emails', async (req, res) => {
        const links = (req.body || {}).links;
        if (!Array.isArray(links)) return res.status(HTTP_BAD_REQUEST).json({ error: 'links must be an array' });
        try {
            res.status(HTTP_CREATED).json(await addEmailLinks(db, links, { createdBy: 'bourne' }));
        } catch (e) {
            if (e instanceof EmailLinkError) return res.status(e.status).json({ error: e.message });
            console.error(e);
            res.status(HTTP_SERVER_ERROR).json({ error: 'Failed to link emails' });
        }
    });
}

module.exports = { registerEmailRoutes };
