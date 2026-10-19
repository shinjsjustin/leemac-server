const { VALID_STAR_STATUSES } = require('../routes/job/shared');

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
         WHERE f.id = ? AND (
           (f.job_id IS NOT NULL AND EXISTS (
             SELECT 1 FROM job j WHERE j.id = f.job_id AND j.company_id = ?))
           OR (f.job_id IS NULL AND EXISTS (
             SELECT 1 FROM job_part jp JOIN job j ON jp.job_id = j.id
             WHERE jp.part_id = f.part_id AND j.company_id = ?))
         ) LIMIT 1`,
        [fileId, companyId, companyId]
    );

const CLIENT_PORTAL_ADMIN_EMAIL = 'client-portal@leemac.invalid';
const NOTE_MAX = 255; // note.content is VARCHAR(255)

class ClientPortalError extends Error {
    constructor(message, status) {
        super(message);
        this.name = 'ClientPortalError';
        this.status = status;
    }
}

async function requireOwned(owns, message) {
    if (!(await owns)) throw new ClientPortalError(message, 404);
}

async function getJob(db, companyId, jobId) {
    if (!(await ownsJob(db, companyId, jobId))) return null;

    const [jobRows] = await db.execute(
        `SELECT job.id, job.job_number, job.attention, job.po_number, job.po_date, job.due_date,
                job.invoice_number, job.created_at, company.name AS company_name
         FROM job
         JOIN company ON job.company_id = company.id
         WHERE job.id = ?`,
        [jobId]
    );
    const [parts] = await db.execute(
        `SELECT part.id, part.number, part.description, job_part.id AS job_part_id, job_part.price, job_part.rev,
                job_part.details, job_part.note, job_part.material, job_part.finish, job_part.stock_size,
                job_part.quantity, s.status AS star_status
         FROM job_part
         JOIN part ON job_part.part_id = part.id
         LEFT JOIN stars s ON s.job_part_id = job_part.id
         WHERE job_part.job_id = ?`,
        [jobId]
    );
    return { job: jobRows[0], parts };
}

async function getPart(db, companyId, partId) {
    if (!(await ownsPart(db, companyId, partId))) return null;

    const [partRows] = await db.execute('SELECT id, number, description FROM part WHERE id = ?', [partId]);
    const [jobs] = await db.execute(
        `SELECT j.id AS job_id, j.job_number, j.created_at, jp.quantity, jp.price, jp.rev, jp.details
         FROM job_part jp
         JOIN job j ON jp.job_id = j.id
         WHERE jp.part_id = ? AND j.company_id = ?
         ORDER BY j.created_at DESC`,
        [partId, companyId]
    );
    return { part: partRows[0], jobs };
}

async function listPartFiles(db, companyId, partId) {
    if (!(await ownsPart(db, companyId, partId))) return null;

    const [files] = await db.execute(
        'SELECT id, filename, mimetype, size, content, uploaded_at FROM uploaded_files WHERE part_id = ?',
        [partId]
    );
    return files.map((file) => ({
        id: file.id,
        filename: file.filename,
        mimetype: file.mimetype,
        size: file.size,
        content: file.content.toString('base64'),
    }));
}

async function listJobFiles(db, companyId, jobId) {
    if (!(await ownsJob(db, companyId, jobId))) return null;

    const [rows] = await db.execute(
        'SELECT id, filename, mimetype, size, uploaded_at FROM uploaded_files WHERE job_id = ?',
        [jobId]
    );
    return rows;
}

async function getFile(db, companyId, fileId) {
    if (!(await ownsFile(db, companyId, fileId))) return null;

    const [rows] = await db.execute('SELECT * FROM uploaded_files WHERE id = ?', [fileId]);
    return rows[0] || null;
}

async function listNotes(db, companyId, jobId) {
    if (!(await ownsJob(db, companyId, jobId))) return null;

    const [rows] = await db.execute(
        `SELECT n.id, n.content, n.status, n.created_at, a.name AS author
         FROM note n JOIN admin a ON n.userid = a.id
         WHERE n.jobid = ? ORDER BY n.id`,
        [jobId]
    );
    return rows;
}

async function addClientNote(db, companyId, jobId, clientName, content) {
    await requireOwned(ownsJob(db, companyId, jobId), 'Job not found');

    const text = typeof content === 'string' ? content.trim() : '';
    if (!text) throw new ClientPortalError('content is required', 400);

    const [admins] = await db.execute('SELECT id FROM admin WHERE email = ?', [CLIENT_PORTAL_ADMIN_EMAIL]);
    if (admins.length === 0) {
        throw new ClientPortalError('Client note author missing; apply migration 009', 503);
    }

    const [result] = await db.execute(
        'INSERT INTO note (content, userid, jobid) VALUES (?, ?, ?)',
        [`${clientName}: ${text}`.slice(0, NOTE_MAX), admins[0].id, jobId]
    );
    return { id: result.insertId };
}

async function setStarStatus(db, companyId, jobPartId, status) {
    if (!VALID_STAR_STATUSES.includes(status)) throw new ClientPortalError('Invalid status', 400);
    await requireOwned(ownsJobPart(db, companyId, jobPartId), 'Job part not found');

    await db.execute('UPDATE stars SET status = ? WHERE job_part_id = ?', [status, jobPartId]);
}

module.exports = {
    listStarred, listJobs, listParts, ownsJob, ownsJobPart, ownsPart, ownsFile,
    ClientPortalError, getJob, getPart, listPartFiles, listJobFiles, getFile, listNotes, addClientNote, setStarStatus,
};
