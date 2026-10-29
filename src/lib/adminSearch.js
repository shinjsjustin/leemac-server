const MIN_QUERY_LENGTH = 2;
const RESULT_LIMIT = 6;
const INVOICE_ACCESS = 3;
const LIKE_ESCAPE = '!';

// '!' is the escape char (not backslash) so the same SQL is valid on mysql and sqlite.
const likePattern = (q) => `%${q.replace(/[!%_]/g, (c) => LIKE_ESCAPE + c)}%`;

const PARTS_SQL = `SELECT id AS part_id, number, description FROM part
    WHERE number LIKE ? ESCAPE '!' OR description LIKE ? ESCAPE '!'
    ORDER BY number LIMIT ${RESULT_LIMIT}`;

const JOBS_SQL = `SELECT j.id, j.job_number, c.name AS company_name, j.attention, j.po_number
    FROM job j LEFT JOIN company c ON c.id = j.company_id
    WHERE j.job_number LIKE ? ESCAPE '!' OR j.po_number LIKE ? ESCAPE '!'
        OR c.name LIKE ? ESCAPE '!' OR j.attention LIKE ? ESCAPE '!'
    ORDER BY j.id DESC LIMIT ${RESULT_LIMIT}`;

const INVOICES_SQL = `SELECT j.id AS job_id, j.invoice_number, j.job_number, c.name AS company_name, j.invoice_status
    FROM job j LEFT JOIN company c ON c.id = j.company_id
    WHERE j.invoice_number LIKE ? ESCAPE '!'
    ORDER BY j.id DESC LIMIT ${RESULT_LIMIT}`;

async function searchAdmin(db, q, access) {
    const term = String(q || '').trim();
    if (term.length < MIN_QUERY_LENGTH) return { parts: [], jobs: [], invoices: [] };
    const pattern = likePattern(term);
    const [parts] = await db.execute(PARTS_SQL, [pattern, pattern]);
    const [jobs] = await db.execute(JOBS_SQL, [pattern, pattern, pattern, pattern]);
    const [invoices] = access >= INVOICE_ACCESS ? await db.execute(INVOICES_SQL, [pattern]) : [[]];
    return { parts, jobs, invoices };
}

module.exports = { searchAdmin };
