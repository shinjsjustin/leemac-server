const { withTransaction, QuoteRequestError } = require('./quoteRequests');
const { insertQuoteJob } = require('./quoteJob');

const BAD_REQUEST = 400;
const CONFLICT = 409;

// Copies rows from quote_request_file into uploaded_files, skipping any file
// whose filename and size are already on the target part or job.
const copyFiles = (conn, targetColumn, fileFilter, params) => conn.execute(
    `INSERT INTO uploaded_files (filename, mimetype, size, content, ${targetColumn})
     SELECT f.filename, f.mimetype, f.size, f.content, ?
     FROM quote_request_file f
     WHERE ${fileFilter}
       AND NOT EXISTS (
           SELECT 1 FROM uploaded_files u
           WHERE u.${targetColumn} = ? AND u.filename = f.filename AND u.size = f.size
       )`,
    params
);

function assertLineComplete(line) {
    const partNumber = line.part_number == null ? '' : String(line.part_number).trim();
    if (!partNumber || !Number.isInteger(line.quantity) || line.quantity < 1 || line.price == null) {
        throw new QuoteRequestError('Every line needs a part number, a quantity of at least 1 and a price.', BAD_REQUEST);
    }
}

// Turns a reviewed request into a numbered job. Returns null when the request
// is missing or still a draft.
function createJobFromRequest(db, id) {
    return withTransaction(db, async (conn) => {
        const [requests] = await conn.execute(
            `SELECT id, company_id, client_name, status FROM quote_request WHERE id = ? FOR UPDATE`,
            [id]
        );
        const request = requests[0];
        if (!request || request.status === 'draft') return null;
        if (request.status === 'job_created') throw new QuoteRequestError('This request already has a job.', CONFLICT);

        const [lines] = await conn.execute(
            `SELECT id, part_number, description, rev, material, finish, quantity, price
             FROM quote_request_line WHERE request_id = ? ORDER BY position`,
            [id]
        );
        lines.forEach(assertLineComplete);

        const job = await insertQuoteJob(conn, {
            company_id: request.company_id,
            attention: request.client_name,
            parts: lines,
        });

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const partId = job.part_ids[i];
            await conn.execute(`UPDATE quote_request_line SET part_id = ? WHERE id = ?`, [partId, line.id]);
            if (line.description && line.description.trim()) {
                await conn.execute(`UPDATE part SET description = ? WHERE id = ?`, [line.description, partId]);
            }
            await copyFiles(conn, 'part_id', 'f.line_id = ?', [partId, line.id, partId]);
        }
        await copyFiles(conn, 'job_id', 'f.request_id = ? AND f.line_id IS NULL', [job.id, id, job.id]);

        await conn.execute(
            `UPDATE quote_request SET status = 'job_created', job_id = ?, reviewed_at = NOW(), updated_at = NOW() WHERE id = ?`,
            [job.id, id]
        );
        return { id: job.id, job_number: job.job_number };
    });
}

module.exports = { createJobFromRequest };
