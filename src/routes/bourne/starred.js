const { groupBy, fileMeta, selectIn } = require('../../lib/bourne/helpers');

// Every query here is a SELECT with explicit columns; file content is never selected.
const FILE_COLUMNS = 'uf.id, uf.filename, uf.mimetype, uf.size, uf.uploaded_at';

async function fetchStarredRows(db) {
    const [rows] = await db.execute(
        `SELECT
            j.id AS job_id, j.job_number, c.name AS client, j.attention, j.po_number,
            j.po_date, j.due_date, j.ship_date, j.created_at, j.invoice_number,
            j.invoice_date, j.invoice_status,
            jp.id AS job_part_id, p.id AS part_id, p.number, p.description,
            jp.quantity, jp.price, jp.rev, jp.details, jp.note,
            s.status AS star_status, s.attention AS star_attention, s.nfc_tag_id
         FROM stars s
         JOIN job_part jp ON s.job_part_id = jp.id
         JOIN part p ON jp.part_id = p.id
         JOIN job j ON jp.job_id = j.id
         JOIN company c ON j.company_id = c.id
         ORDER BY j.id, jp.id`
    );
    return rows;
}

function buildJobs(starRows, notesByJob, partFiles, noteFiles) {
    return [...groupBy(starRows, 'job_id').values()].map((rows) => {
        const first = rows[0];
        return {
            job_id: first.job_id,
            job_number: first.job_number,
            client: first.client,
            attention: first.attention,
            po_number: first.po_number,
            po_date: first.po_date,
            due_date: first.due_date,
            ship_date: first.ship_date,
            created_at: first.created_at,
            invoice_number: first.invoice_number,
            invoice_date: first.invoice_date,
            invoice_status: first.invoice_status,
            notes: (notesByJob.get(first.job_id) || []).map((n) => ({
                id: n.id,
                content: n.content,
                status: n.status,
                created_at: n.created_at,
                author: n.author,
                files: (noteFiles.get(n.id) || []).map(fileMeta),
            })),
            parts: rows.map((r) => ({
                job_part_id: r.job_part_id,
                part_id: r.part_id,
                number: r.number,
                description: r.description,
                quantity: r.quantity,
                price: r.price,
                rev: r.rev,
                details: r.details,
                note: r.note,
                star: { status: r.star_status, attention: r.star_attention, nfc_tag_id: r.nfc_tag_id },
                files: (partFiles.get(r.part_id) || []).map(fileMeta),
            })),
        };
    });
}

function starredHandler(db) {
    return async (req, res) => {
        try {
            const starRows = await fetchStarredRows(db);
            const jobIds = [...new Set(starRows.map((r) => r.job_id))];
            const partIds = [...new Set(starRows.map((r) => r.part_id))];

            const noteRows = await selectIn(db,
                `SELECT n.id, n.jobid AS job_id, n.content, n.status, n.created_at, a.name AS author
                 FROM note n JOIN admin a ON n.userid = a.id
                 WHERE n.jobid IN (?) ORDER BY n.id`, jobIds);
            const noteIds = noteRows.map((n) => n.id);

            const partFileRows = await selectIn(db,
                `SELECT ${FILE_COLUMNS}, uf.part_id FROM uploaded_files uf
                 WHERE uf.part_id IN (?) ORDER BY uf.id`, partIds);
            const noteFileRows = await selectIn(db,
                `SELECT ${FILE_COLUMNS}, uf.note_id FROM uploaded_files uf
                 WHERE uf.note_id IN (?) ORDER BY uf.id`, noteIds);

            res.json({
                jobs: buildJobs(
                    starRows,
                    groupBy(noteRows, 'job_id'),
                    groupBy(partFileRows, 'part_id'),
                    groupBy(noteFileRows, 'note_id'),
                ),
            });
        } catch (e) {
            console.error(e);
            res.status(500).json({ error: 'Failed to fetch starred parts.' });
        }
    };
}

module.exports = { starredHandler };
