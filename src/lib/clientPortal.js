const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

// Non-numeric input falls back to the default; numeric input is truncated and clamped.
function toInt(value, fallback, min, max = Infinity) {
    const n = Math.trunc(Number(value));
    if (!Number.isFinite(n)) return fallback;
    return Math.min(Math.max(n, min), max);
}

async function listStarred(db, companyId) {
    const [rows] = await db.execute(
        `SELECT
            s.job_part_id,
            s.status,
            s.attention,
            s.nfc_tag_id,
            jp.id AS job_part_id,
            jp.quantity,
            jp.price,
            jp.rev,
            jp.details,
            jp.note AS part_note,
            p.id AS part_id,
            p.number AS part_number,
            p.description AS part_description,
            j.id AS job_id,
            j.job_number,
            j.attention,
            j.po_number,
            j.po_date,
            j.due_date,
            j.invoice_number,
            j.created_at,
            c.name AS company_name
         FROM stars s
         JOIN job_part jp ON s.job_part_id = jp.id
         JOIN part p ON jp.part_id = p.id
         JOIN job j ON jp.job_id = j.id
         JOIN company c ON j.company_id = c.id
         WHERE j.company_id = ?`,
        [companyId]
    );
    return rows;
}

async function listJobs(db, companyId, { limit, offset } = {}) {
    const safeLimit = toInt(limit || DEFAULT_LIMIT, DEFAULT_LIMIT, 1, MAX_LIMIT);
    const safeOffset = toInt(offset, 0, 0);

    const [countRows] = await db.execute(
        'SELECT COUNT(*) as total FROM job WHERE company_id = ?',
        [companyId]
    );
    const total = countRows[0].total;

    const [jobRows] = await db.execute(
        `SELECT job.id, job.job_number, job.attention, job.created_at, job.po_number, job.po_date, job.invoice_number
         FROM job
         WHERE job.company_id = ?
         ORDER BY job.created_at DESC
         LIMIT ${safeLimit} OFFSET ${safeOffset}`,
        [companyId]
    );

    let jobs = [];
    if (jobRows.length > 0) {
        const jobIds = jobRows.map((j) => j.id);
        const placeholders = jobIds.map(() => '?').join(', ');
        const [allParts] = await db.execute(
            `SELECT jp.job_id, p.number, jp.quantity, jp.price
             FROM job_part jp
             JOIN part p ON jp.part_id = p.id
             WHERE jp.job_id IN (${placeholders})`,
            jobIds
        );
        jobs = jobRows.map((job) => ({
            ...job,
            parts: allParts
                .filter((part) => part.job_id === job.id)
                .map(({ number, quantity, price }) => ({ number, quantity, price })),
        }));
    }

    return {
        jobs,
        pagination: { total, limit: safeLimit, offset: safeOffset, hasMore: safeOffset + safeLimit < total },
    };
}

async function listParts(db, companyId, { number, description } = {}) {
    const conditions = [];
    const params = [companyId];
    if (number) {
        conditions.push('p.number LIKE ?');
        params.push(`%${number}%`);
    }
    if (description) {
        conditions.push('p.description LIKE ?');
        params.push(`%${description}%`);
    }
    const partFilter = conditions.length > 0 ? `AND ${conditions.join(' AND ')}` : '';

    const [rows] = await db.execute(
        `SELECT DISTINCT
            p.id,
            p.number,
            p.description,
            latest_job.job_number as latest_job_number,
            latest_job.price as latest_price,
            latest_job.quantity as latest_quantity,
            latest_job.rev as latest_rev,
            latest_job.details as latest_details,
            latest_job.created_at as latest_job_date
         FROM part p
         INNER JOIN (
             SELECT
                 jp.part_id,
                 j.job_number,
                 jp.price,
                 jp.quantity,
                 jp.rev,
                 jp.details,
                 j.created_at,
                 ROW_NUMBER() OVER (PARTITION BY jp.part_id ORDER BY j.created_at DESC) as rn
             FROM job_part jp
             INNER JOIN job j ON jp.job_id = j.id
             WHERE j.company_id = ?
         ) latest_job ON p.id = latest_job.part_id AND latest_job.rn = 1
         ${partFilter}
         ORDER BY p.number`,
        params
    );
    return rows;
}

async function exists(db, sql, params) {
    const [rows] = await db.execute(sql, params);
    return rows.length > 0;
}

const ownsJob = (db, companyId, jobId) =>
    exists(db, 'SELECT job.id FROM job WHERE job.id = ? AND job.company_id = ? LIMIT 1', [jobId, companyId]);

const ownsJobPart = (db, companyId, jobPartId) =>
    exists(
        db,
        `SELECT jp.id FROM job_part jp
         JOIN job j ON jp.job_id = j.id
         WHERE jp.id = ? AND j.company_id = ? LIMIT 1`,
        [jobPartId, companyId]
    );

const ownsPart = (db, companyId, partId) =>
    exists(
        db,
        `SELECT jp.part_id FROM job_part jp
         JOIN job j ON jp.job_id = j.id
         WHERE jp.part_id = ? AND j.company_id = ? LIMIT 1`,
        [partId, companyId]
    );

const ownsFile = (db, companyId, fileId) =>
    exists(
        db,
        `SELECT f.id FROM uploaded_files f
         LEFT JOIN job fj ON f.job_id = fj.id
         LEFT JOIN job_part jp ON f.part_id = jp.part_id
         LEFT JOIN job pj ON jp.job_id = pj.id
         WHERE f.id = ? AND (fj.company_id = ? OR pj.company_id = ?) LIMIT 1`,
        [fileId, companyId, companyId]
    );

module.exports = { listStarred, listJobs, listParts, ownsJob, ownsJobPart, ownsPart, ownsFile };
