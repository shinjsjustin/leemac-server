const { BadQuery, parseInteger, groupBy, fileMeta, pick, selectIn } = require('../../lib/bourne/helpers');

// Every query here is a SELECT with explicit columns; file content is never selected.
const FILE_COLUMNS = 'uf.id, uf.filename, uf.mimetype, uf.size, uf.uploaded_at';

const JOB_FIELDS = ['id', 'job_number', 'client', 'attention', 'po_number', 'po_date', 'due_date',
    'ship_date', 'created_at', 'invoice_number', 'invoice_date', 'invoice_status', 'subtotal', 'tax',
    'tax_percent', 'total_cost'];
const EXPENSE_FIELDS = ['id', 'description', 'vendor', 'amount', 'expense_date', 'category'];

async function fetchJob(db, id) {
    const [rows] = await db.execute(
        `SELECT j.id, j.job_number, c.name AS client, j.attention, j.po_number, j.po_date,
            j.due_date, j.ship_date, j.created_at, j.invoice_number, j.invoice_date,
            j.invoice_status, j.subtotal, j.tax, j.tax_percent, j.total_cost
         FROM job j JOIN company c ON j.company_id = c.id
         WHERE j.id = ?`, [id]);
    return rows[0];
}

async function fetchParts(db, id) {
    const [rows] = await db.execute(
        `SELECT jp.id AS job_part_id, p.id AS part_id, p.number, p.description,
            jp.quantity, jp.price, jp.rev, jp.details, jp.note,
            s.status AS star_status, s.attention AS star_attention, s.nfc_tag_id
         FROM job_part jp
         JOIN part p ON jp.part_id = p.id
         LEFT JOIN stars s ON s.job_part_id = jp.id
         WHERE jp.job_id = ? ORDER BY jp.id`, [id]);
    return rows;
}

async function fetchNotes(db, id) {
    const [rows] = await db.execute(
        `SELECT n.id, n.content, n.status, n.created_at, a.name AS author
         FROM note n JOIN admin a ON n.userid = a.id
         WHERE n.jobid = ? ORDER BY n.id`, [id]);
    return rows;
}

async function fetchExpenses(db, id) {
    const [rows] = await db.execute(
        `SELECT e.id, e.description, e.vendor, e.amount, e.expense_date, e.category
         FROM expense_job ej JOIN expense e ON ej.expense_id = e.id
         WHERE ej.job_id = ? ORDER BY e.id`, [id]);
    return rows;
}

// mysql2 returns DECIMAL columns as strings; the API serves numbers.
function priceToNumber(price) {
    return price === null ? null : Number(price);
}

function jobDetailHandler(db) {
    return async (req, res) => {
        try {
            const id = parseInteger(req.params.id, 'id');
            const job = await fetchJob(db, id);
            if (!job) return res.status(404).json({ error: 'Job not found.' });

            const [partRows, noteRows, expenses] = await Promise.all([
                fetchParts(db, id), fetchNotes(db, id), fetchExpenses(db, id),
            ]);
            const partFiles = groupBy(await selectIn(db,
                `SELECT ${FILE_COLUMNS}, uf.part_id FROM uploaded_files uf
                 WHERE uf.part_id IN (?) ORDER BY uf.id`, partRows.map((r) => r.part_id)), 'part_id');
            const noteFiles = groupBy(await selectIn(db,
                `SELECT ${FILE_COLUMNS}, uf.note_id FROM uploaded_files uf
                 WHERE uf.note_id IN (?) ORDER BY uf.id`, noteRows.map((n) => n.id)), 'note_id');

            res.json({
                job: {
                    ...pick(job, JOB_FIELDS),
                    parts: partRows.map((r) => ({
                        job_part_id: r.job_part_id,
                        part_id: r.part_id,
                        number: r.number,
                        description: r.description,
                        quantity: r.quantity,
                        price: priceToNumber(r.price),
                        rev: r.rev,
                        details: r.details,
                        note: r.note,
                        star: r.star_status === null
                            ? null
                            : { status: r.star_status, attention: r.star_attention, nfc_tag_id: r.nfc_tag_id },
                        files: (partFiles.get(r.part_id) || []).map(fileMeta),
                    })),
                    notes: noteRows.map((n) => ({
                        id: n.id,
                        content: n.content,
                        status: n.status,
                        created_at: n.created_at,
                        author: n.author,
                        files: (noteFiles.get(n.id) || []).map(fileMeta),
                    })),
                    expenses: expenses.map((e) => pick(e, EXPENSE_FIELDS)),
                },
            });
        } catch (e) {
            if (e instanceof BadQuery) return res.status(400).json({ error: e.message });
            console.error(e);
            res.status(500).json({ error: 'Failed to fetch job.' });
        }
    };
}

module.exports = { jobDetailHandler, priceToNumber };
