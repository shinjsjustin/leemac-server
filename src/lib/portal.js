const { ownsJob, ownsPart } = require('./clientPortal');

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const JOB_FIELDS = ['id', 'job_number', 'status', 'po_number', 'po_date', 'due_date', 'ship_date', 'parts'];
const PART_FIELDS = ['job_part_id', 'part_id', 'part_number', 'rev', 'quantity', 'status', 'unit_price'];
const FILE_FIELDS = ['id', 'filename', 'mimetype', 'size', 'uploaded_at'];
const FILE_DOWNLOAD_FIELDS = ['filename', 'mimetype', 'size', 'content'];

const pick = (row, keys) => Object.fromEntries(keys.map((k) => [k, row[k]]));

// Non-numeric input falls back to the default; numeric input is truncated and clamped.
function toInt(value, fallback, min, max = Infinity) {
    const n = Math.trunc(Number(value));
    if (!Number.isFinite(n)) return fallback;
    return Math.min(Math.max(n, min), max);
}

const jobStatus = (job) => (job.ship_date ? 'shipped' : 'open');

function shapePart(row, status) {
    return pick({
        ...row,
        status: row.star_status || status,
        unit_price: row.price == null ? null : Number(row.price),
    }, PART_FIELDS);
}

async function loadParts(db, jobRows) {
    const placeholders = jobRows.map(() => '?').join(', ');
    const [partRows] = await db.execute(
        `SELECT jp.job_id, jp.id AS job_part_id, p.id AS part_id, p.number AS part_number,
                jp.rev, jp.quantity, jp.price, s.status AS star_status
         FROM job_part jp
         JOIN part p ON jp.part_id = p.id
         LEFT JOIN stars s ON s.job_part_id = jp.id
         WHERE jp.job_id IN (${placeholders})
         ORDER BY jp.id`,
        jobRows.map((j) => j.id)
    );
    return jobRows.map((job) => {
        const status = jobStatus(job);
        const parts = partRows.filter((r) => r.job_id === job.id).map((r) => shapePart(r, status));
        return pick({ ...job, status, parts }, JOB_FIELDS);
    });
}

async function listJobs(db, companyId, { limit, offset } = {}) {
    const safeLimit = toInt(limit,DEFAULT_LIMIT, 1, MAX_LIMIT);
    const safeOffset = toInt(offset, 0, 0);

    const [countRows] = await db.execute('SELECT COUNT(*) AS total FROM job WHERE company_id = ?', [companyId]);
    const total = countRows[0].total;

    const [jobRows] = await db.execute(
        `SELECT j.id, j.job_number, j.po_number, j.po_date, j.due_date, j.ship_date
         FROM job j
         WHERE j.company_id = ?
         ORDER BY j.created_at DESC, j.id DESC
         LIMIT ${safeLimit} OFFSET ${safeOffset}`,
        [companyId]
    );
    const jobs = jobRows.length > 0 ? await loadParts(db, jobRows) : [];

    return {
        jobs,
        pagination: { total, limit: safeLimit, offset: safeOffset, hasMore: safeOffset + safeLimit < total },
    };
}

async function getJob(db, companyId, jobId) {
    if (!(await ownsJob(db, companyId, jobId))) return null;

    const [jobRows] = await db.execute(
        `SELECT j.id, j.job_number, j.po_number, j.po_date, j.due_date, j.ship_date
         FROM job j
         WHERE j.id = ? AND j.company_id = ?`,
        [jobId, companyId]
    );
    if (jobRows.length === 0) return null;
    return (await loadParts(db, jobRows))[0];
}

async function listPartFiles(db, companyId, partId) {
    if (!(await ownsPart(db, companyId, partId))) return null;

    const [rows] = await db.execute(
        `SELECT f.id, f.filename, f.mimetype, f.size, f.uploaded_at
         FROM uploaded_files f
         WHERE f.part_id = ? AND f.job_id IS NULL AND f.note_id IS NULL
         ORDER BY f.id`,
        [partId]
    );
    return rows.map((row) => pick(row, FILE_FIELDS));
}

async function getPartFile(db, companyId, fileId) {
    const [rows] = await db.execute(
        `SELECT f.filename, f.mimetype, f.size, f.content
         FROM uploaded_files f
         WHERE f.id = ? AND f.part_id IS NOT NULL AND f.job_id IS NULL AND f.note_id IS NULL
           AND EXISTS (
             SELECT 1 FROM job_part jp JOIN job j ON jp.job_id = j.id
             WHERE jp.part_id = f.part_id AND j.company_id = ?)
         LIMIT 1`,
        [fileId, companyId]
    );
    return rows.length > 0 ? pick(rows[0], FILE_DOWNLOAD_FIELDS) : null;
}

module.exports = { listJobs, getJob, listPartFiles, getPartFile };
