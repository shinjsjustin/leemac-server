const { BadQuery, parsePaging, pick } = require('../../lib/bourne/helpers');

const COMPANY_FIELDS = ['id', 'name', 'code', 'address_line1', 'address_line2',
    'bill_to_name', 'bill_to_line1', 'bill_to_line2', 'bill_to_line3', 'bill_to_line4', 'bill_to_line5'];

// Name-only search; the value only ever reaches SQL as a bound param.
function parseFilters({ q }) {
    if (!q) return { where: '', params: [] };
    return { where: 'WHERE LOWER(c.name) LIKE ?', params: [`%${String(q).toLowerCase()}%`] };
}

function companiesHandler(db) {
    return async (req, res) => {
        let paging;
        try {
            paging = parsePaging(req.query);
        } catch (e) {
            if (e instanceof BadQuery) return res.status(400).json({ error: e.message });
            throw e;
        }
        const { where, params } = parseFilters(req.query);
        const { limit, offset } = paging;
        try {
            const [countRows] = await db.execute(
                `SELECT COUNT(*) AS total FROM company c ${where}`, params);
            const total = Number(countRows[0].total);

            // limit and offset are validated integers, so interpolating them is safe.
            const [companies] = await db.execute(
                `SELECT c.id, c.name, c.code, c.address_line1, c.address_line2,
                        c.bill_to_name, c.bill_to_line1, c.bill_to_line2, c.bill_to_line3, c.bill_to_line4, c.bill_to_line5
                 FROM company c
                 ${where}
                 ORDER BY c.name ASC, c.id ASC
                 LIMIT ${limit} OFFSET ${offset}`, params);

            res.json({ companies: companies.map((c) => pick(c, COMPANY_FIELDS)), pagination: { total, limit, offset, hasMore: offset + limit < total } });
        } catch (e) {
            console.error(e);
            res.status(500).json({ error: 'Failed to fetch companies.' });
        }
    };
}

module.exports = { companiesHandler };
