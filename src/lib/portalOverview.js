const { listJobs } = require('./portal');
const { listLists } = require('./partLists');
const { listRequests } = require('./quoteRequests');

const OWNED_PARTS = `SELECT jp.part_id FROM job_part jp JOIN job j ON j.id = jp.job_id WHERE j.company_id = ?`;

const kindOf = (mimetype) => {
    if (mimetype === 'application/pdf') return 'pdf';
    return String(mimetype).startsWith('image/') ? 'image' : 'other';
};

const toDrawing = ({ id, filename, mimetype }) => ({
    id, filename, mimetype, kind: kindOf(mimetype), url: `/api/portal/files/${id}`,
});

// One query for the company's parts with their jobs, one for those parts' drawings (never content).
async function loadParts(db, companyId) {
    const [partRows, fileRows] = await Promise.all([
        db.execute(
            `SELECT p.id AS part_id, p.number AS part_number, p.description AS part_description,
                    j.id AS job_id, j.job_number
             FROM job_part jp
             JOIN job j ON j.id = jp.job_id
             JOIN part p ON p.id = jp.part_id
             WHERE j.company_id = ?
             ORDER BY p.number, p.id, j.id`,
            [companyId]
        ),
        db.execute(
            `SELECT f.id, f.part_id, f.filename, f.mimetype FROM uploaded_files f
             WHERE f.job_id IS NULL AND f.note_id IS NULL AND f.part_id IN (${OWNED_PARTS})
             ORDER BY f.id DESC`,
            [companyId]
        ),
    ]).then((results) => results.map(([rows]) => rows));

    const parts = new Map();
    for (const row of partRows) {
        if (!parts.has(row.part_id)) {
            parts.set(row.part_id, {
                part_id: row.part_id, part_number: row.part_number, part_description: row.part_description,
                jobs: [], drawings: [],
            });
        }
        const part = parts.get(row.part_id);
        if (!part.jobs.some((job) => job.id === row.job_id)) part.jobs.push({ id: row.job_id, job_number: row.job_number });
    }
    for (const file of fileRows) {
        if (parts.has(file.part_id)) parts.get(file.part_id).drawings.push(toDrawing(file));
    }
    return [...parts.values()];
}

async function getOverview(db, user, query) {
    const [{ jobs, pagination }, parts, lists, requests] = await Promise.all([
        listJobs(db, user.company_id, query),
        loadParts(db, user.company_id),
        listLists(db, user),
        listRequests(db, user),
    ]);
    return { jobs, pagination, parts, lists, requests };
}

module.exports = { getOverview };
