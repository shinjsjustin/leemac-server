const { BadQuery, parseInteger, parsePaging, fileMeta, pick } = require('../../lib/bourne/helpers');
const { priceToNumber } = require('./jobDetail');

const PART_FIELDS = ['id', 'number', 'description'];
const PART_JOB_FIELDS = ['job_id', 'job_number', 'client', 'po_number', 'po_date', 'due_date', 'created_at',
    'invoice_status', 'job_part_id', 'quantity', 'price', 'rev', 'details', 'star_status'];

// Builds the shared WHERE clause; values only ever reach SQL as bound params.
function parseFilters({ q, number, description }) {
    const conditions = [];
    const params = [];
    if (q) {
        conditions.push('(p.number LIKE ? OR p.description LIKE ?)');
        params.push(`%${q}%`, `%${q}%`);
    }
    if (number) {
        conditions.push('p.number LIKE ?');
        params.push(`%${number}%`);
    }
    if (description) {
        conditions.push('p.description LIKE ?');
        params.push(`%${description}%`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    return { where, params };
}

function partsHandler(db) {
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
                `SELECT COUNT(*) AS total FROM part p ${where}`, params);
            const total = Number(countRows[0].total);

            // limit and offset are validated integers, so interpolating them is safe.
            const [parts] = await db.execute(
                `SELECT p.id, p.number, p.description
                 FROM part p
                 ${where}
                 ORDER BY p.number, p.id
                 LIMIT ${limit} OFFSET ${offset}`, params);

            res.json({ parts: parts.map((p) => pick(p, PART_FIELDS)), pagination: { total, limit, offset, hasMore: offset + limit < total } });
        } catch (e) {
            console.error(e);
            res.status(500).json({ error: 'Failed to fetch parts.' });
        }
    };
}

function partDetailHandler(db) {
    return async (req, res) => {
        try {
            const id = parseInteger(req.params.id, 'id');
            const [partRows] = await db.execute(
                'SELECT p.id, p.number, p.description FROM part p WHERE p.id = ?', [id]);
            if (partRows.length === 0) return res.status(404).json({ error: 'Part not found.' });

            const [[jobs], [files]] = await Promise.all([
                db.execute(
                    `SELECT j.id AS job_id, j.job_number, c.name AS client, j.po_number, j.po_date,
                        j.due_date, j.created_at, j.invoice_status,
                        jp.id AS job_part_id, jp.quantity, jp.price, jp.rev, jp.details,
                        s.status AS star_status
                     FROM job_part jp
                     JOIN job j ON jp.job_id = j.id
                     JOIN company c ON j.company_id = c.id
                     LEFT JOIN stars s ON s.job_part_id = jp.id
                     WHERE jp.part_id = ?
                     ORDER BY j.created_at DESC, j.id DESC`, [id]),
                db.execute(
                    `SELECT uf.id, uf.filename, uf.mimetype, uf.size, uf.uploaded_at
                     FROM uploaded_files uf WHERE uf.part_id = ? ORDER BY uf.id`, [id]),
            ]);

            res.json({ part: { ...pick(partRows[0], PART_FIELDS), jobs: jobs.map((j) => ({ ...pick(j, PART_JOB_FIELDS), price: priceToNumber(j.price) })), files: files.map(fileMeta) } });
        } catch (e) {
            if (e instanceof BadQuery) return res.status(400).json({ error: e.message });
            console.error(e);
            res.status(500).json({ error: 'Failed to fetch part.' });
        }
    };
}

module.exports = { partsHandler, partDetailHandler };
