const { BadQuery, parseInteger } = require('../../lib/bourne/helpers');
const { listEmailLinks } = require('../../lib/emailLinks');

// Answers the emails linked to the job or part named by :id.
function emailsHandler(db, { table, label, key }) {
    return async (req, res) => {
        try {
            const id = parseInteger(req.params.id, 'id');
            const [rows] = await db.execute(`SELECT id FROM ${table} WHERE id = ?`, [id]);
            if (rows.length === 0) return res.status(404).json({ error: `${label} not found.` });
            res.json({ emails: await listEmailLinks(db, { [key]: id }) });
        } catch (e) {
            if (e instanceof BadQuery) return res.status(400).json({ error: e.message });
            console.error(e);
            res.status(500).json({ error: 'Failed to fetch emails.' });
        }
    };
}

const jobEmailsHandler = (db) => emailsHandler(db, { table: 'job', label: 'Job', key: 'jobId' });
const partEmailsHandler = (db) => emailsHandler(db, { table: 'part', label: 'Part', key: 'partId' });

module.exports = { jobEmailsHandler, partEmailsHandler };
