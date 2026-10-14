const { BadQuery, parseInteger, parsePaging, pick } = require('../../lib/bourne/helpers');

const JOB_FIELDS = ['id', 'job_number', 'client', 'attention', 'po_number', 'po_date', 'due_date',
    'created_at', 'invoice_number', 'invoice_status'];

function parseDate(value, name) {
    const date = new Date(`${value}T00:00:00Z`);
    // Rejects impossible dates like 2026-02-30, which Date would roll over.
    const isValid = /^\d{4}-\d{2}-\d{2}$/.test(value)
        && !Number.isNaN(date.getTime())
        && date.toISOString().startsWith(value);
    if (!isValid) throw new BadQuery(`${name} must be a YYYY-MM-DD date.`);
    return value;
}

// Builds the shared WHERE clause; values only ever reach SQL as bound params.
function parseFilters({ since, client, from, to }) {
    const conditions = [];
    const params = [];
    if (since !== undefined) {
        conditions.push('j.created_at >= ?');
        params.push(parseDate(since, 'since'));
    }
    if (client) {
        conditions.push('(c.name LIKE ? OR j.attention LIKE ?)');
        params.push(`%${client}%`, `%${client}%`);
    }
    if (from !== undefined) {
        conditions.push('CAST(j.job_number AS UNSIGNED) >= ?');
        params.push(parseInteger(from, 'from'));
    }
    if (to !== undefined) {
        conditions.push('CAST(j.job_number AS UNSIGNED) <= ?');
        params.push(parseInteger(to, 'to'));
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    return { where, params };
}

function jobsHandler(db) {
    return async (req, res) => {
        let filters;
        let paging;
        try {
            filters = parseFilters(req.query);
            paging = parsePaging(req.query);
        } catch (e) {
            if (e instanceof BadQuery) return res.status(400).json({ error: e.message });
            throw e;
        }
        const { where, params } = filters;
        const { limit, offset } = paging;
        try {
            const [countRows] = await db.execute(
                `SELECT COUNT(*) AS total
                 FROM job j JOIN company c ON j.company_id = c.id
                 ${where}`, params);
            const total = Number(countRows[0].total);

            // limit and offset are validated integers, so interpolating them is safe.
            const [jobs] = await db.execute(
                `SELECT j.id, j.job_number, c.name AS client, j.attention, j.po_number,
                        j.po_date, j.due_date, j.created_at, j.invoice_number, j.invoice_status
                 FROM job j JOIN company c ON j.company_id = c.id
                 ${where}
                 ORDER BY j.created_at DESC, j.id DESC
                 LIMIT ${limit} OFFSET ${offset}`, params);

            res.json({ jobs: jobs.map((j) => pick(j, JOB_FIELDS)), pagination: { total, limit, offset, hasMore: offset + limit < total } });
        } catch (e) {
            console.error(e);
            res.status(500).json({ error: 'Failed to fetch jobs.' });
        }
    };
}

module.exports = { jobsHandler };
