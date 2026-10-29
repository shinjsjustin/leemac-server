const { ownsJob, ownsPart } = require('./clientPortal');
const { stageOf, stageLabel, jobStage, dueFlag } = require('./shopStages');

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const JOB_FIELDS = ['id', 'job_number', 'status', 'po_number', 'po_date', 'due_date', 'ship_date', 'stage', 'flag', 'parts'];
const PART_FIELDS = ['job_part_id', 'part_id', 'part_number', 'part_description', 'rev', 'quantity', 'stage', 'material', 'finish', 'unit_price'];
const FILE_FIELDS = ['id', 'filename', 'mimetype', 'size', 'uploaded_at'];
const FILE_DOWNLOAD_FIELDS = ['filename', 'mimetype', 'size', 'content'];

const SEARCH_MAX_LENGTH = 100;

const pick = (row, keys) => Object.fromEntries(keys.map((k) => [k, row[k]]));

// Non-numeric input falls back to the default; numeric input is truncated and clamped.
function toInt(value, fallback, min, max = Infinity) {
    const n = Math.trunc(Number(value));
    if (!Number.isFinite(n)) return fallback;
    return Math.min(Math.max(n, min), max);
}

const jobStatus = (job) => (job.ship_date ? 'shipped' : 'open');

function shapePart(row) {
    return pick({
        ...row,
        stage: row.star_status ? stageLabel(stageOf(row.star_status)) : null,
                    job_open: !row.ship_date && !row.invoice_date,
        unit_price: row.price == null ? null : Number(row.price),
    }, PART_FIELDS);
}

async function loadParts(db, jobRows, now) {
    const placeholders = jobRows.map(() => '?').join(', ');
    const [partRows] = await db.execute(
        `SELECT jp.job_id, jp.id AS job_part_id, p.id AS part_id, p.number AS part_number,
                p.description AS part_description, jp.rev, jp.quantity, jp.price, jp.material, jp.finish, s.status AS star_status
         FROM job_part jp
         JOIN part p ON jp.part_id = p.id
         LEFT JOIN stars s ON s.job_part_id = jp.id
         WHERE jp.job_id IN (${placeholders})
         ORDER BY jp.id`,
        jobRows.map((j) => j.id)
    );
    return jobRows.map((job) => {
        const jobPartRows = partRows.filter((r) => r.job_id === job.id);
        const stageKey = jobStage(job, jobPartRows.filter((r) => r.star_status).map((r) => r.star_status));
        const flag = dueFlag(job, stageKey, now);
        return pick({
            ...job, status: jobStatus(job), stage: stageLabel(stageKey), flag, parts: jobPartRows.map(shapePart),
        }, JOB_FIELDS);
    });
}

async function listJobs(db, companyId, { limit, offset, q } = {}, now = new Date()) {
    const safeLimit = toInt(limit,DEFAULT_LIMIT, 1, MAX_LIMIT);
    const safeOffset = toInt(offset, 0, 0);

    const pattern = likePattern(q);
    const searchSql = pattern
        ? ` AND (j.job_number LIKE ? ESCAPE '!' OR j.po_number LIKE ? ESCAPE '!' OR EXISTS (SELECT 1 FROM job_part jp JOIN part p ON jp.part_id = p.id WHERE jp.job_id = j.id AND p.number LIKE ? ESCAPE '!'))`
        : '';
    const params = pattern ? [companyId, pattern, pattern, pattern] : [companyId];

    const [countRows] = await db.execute(`SELECT COUNT(*) AS total FROM job j WHERE j.company_id = ?${searchSql}`, params);
    const total = countRows[0].total;

    const [jobRows] = await db.execute(
        `SELECT j.id, j.job_number, j.po_number, j.po_date, j.due_date, j.ship_date, j.invoice_date
         FROM job j
         WHERE j.company_id = ?${searchSql}
         ORDER BY j.created_at DESC, j.id DESC
         LIMIT ${safeLimit} OFFSET ${safeOffset}`,
        params
    );
    const jobs = jobRows.length > 0 ? await loadParts(db, jobRows, now) : [];

    return {
        jobs,
        pagination: { total, limit: safeLimit, offset: safeOffset, hasMore: safeOffset + safeLimit < total },
    };
}

async function getJob(db, companyId, jobId, now = new Date()) {
    if (!(await ownsJob(db, companyId, jobId))) return null;

    const [jobRows] = await db.execute(
        `SELECT j.id, j.job_number, j.po_number, j.po_date, j.due_date, j.ship_date, j.invoice_date
         FROM job j
         WHERE j.id = ? AND j.company_id = ?`,
        [jobId, companyId]
    );
    if (jobRows.length === 0) return null;
    return (await loadParts(db, jobRows, now))[0];
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

// Returns a LIKE pattern for a usable string filter, or null to skip it.
function likePattern(value) {
    if (typeof value !== 'string') return null;
    const text = value.trim().slice(0, SEARCH_MAX_LENGTH);
    if (!text) return null;
    return `%${text.replace(/[!%_]/g, '!$&')}%`;
}

async function listParts(db, companyId, { number, description } = {}) {
    const conditions = ['j.company_id = ?'];
    const params = [companyId];
    const numberPattern = likePattern(number);
    if (numberPattern) {
        conditions.push("p.number LIKE ? ESCAPE '!'");
        params.push(numberPattern);
    }
    const descriptionPattern = likePattern(description);
    if (descriptionPattern) {
        conditions.push("p.description LIKE ? ESCAPE '!'");
        params.push(descriptionPattern);
    }

    const [rows] = await db.execute(
        `SELECT p.id AS part_id, p.number AS part_number, p.description AS part_description,
                j.id AS job_id, j.job_number, j.ship_date, j.invoice_date,
                jp.id AS job_part_id, jp.rev, jp.material, jp.finish, jp.quantity, s.status AS star_status
         FROM job_part jp
         JOIN job j ON jp.job_id = j.id
         JOIN part p ON jp.part_id = p.id
         LEFT JOIN stars s ON s.job_part_id = jp.id
         WHERE ${conditions.join(' AND ')}
         ORDER BY p.number, j.created_at DESC, j.id DESC`,
        params
    );

    const parts = new Map();
    for (const row of rows) {
        if (!parts.has(row.part_id)) {
            parts.set(row.part_id, {
                part_id: row.part_id,
                part_number: row.part_number,
                part_description: row.part_description,
                jobs: [],
                latest: {
                    ...pick(row, ['job_part_id', 'job_id', 'job_number', 'rev', 'material', 'finish', 'quantity']),
                    stage: row.star_status ? stageLabel(stageOf(row.star_status)) : null,
                    job_open: !row.ship_date && !row.invoice_date,
                },
                drawing_count: 0,
                latest_drawing: null,
            });
        }
        const { jobs } = parts.get(row.part_id);
        if (!jobs.some((job) => job.id === row.job_id)) jobs.push({ id: row.job_id, job_number: row.job_number });
    }
    if (parts.size === 0) return [];

    const partIds = [...parts.keys()];
    const [files] = await db.execute(
        `SELECT f.id, f.filename, f.mimetype, f.part_id
         FROM uploaded_files f
         WHERE f.part_id IN (${partIds.map(() => '?').join(', ')})
           AND f.job_id IS NULL AND f.note_id IS NULL
           AND (f.mimetype = 'application/pdf' OR LOWER(f.filename) LIKE '%.pdf')
         ORDER BY f.uploaded_at DESC, f.id DESC`,
        partIds
    );
    for (const file of files) {
        const part = parts.get(file.part_id);
        part.drawing_count += 1;
        part.latest_drawing ??= pick(file, ['id', 'filename', 'mimetype']);
    }
    return [...parts.values()];
}

async function getPart(db, companyId, partId) {
    if (!(await ownsPart(db, companyId, partId))) return null;

    const [partRows] = await db.execute('SELECT p.id, p.number, p.description FROM part p WHERE p.id = ?', [partId]);
    if (partRows.length === 0) return null;

    const [jobRows] = await db.execute(
        `SELECT j.id, j.job_number, jp.quantity, j.po_date
         FROM job_part jp
         JOIN job j ON jp.job_id = j.id
         WHERE jp.part_id = ? AND j.company_id = ?
         ORDER BY j.created_at DESC, j.id DESC`,
        [partId, companyId]
    );
    const jobs = [];
    for (const row of jobRows) {
        if (!jobs.some((job) => job.id === row.id)) jobs.push(pick(row, ['id', 'job_number', 'quantity', 'po_date']));
    }

    const [files] = await db.execute(
        `SELECT f.id, f.filename, f.mimetype, f.size, f.uploaded_at
         FROM uploaded_files f
         WHERE f.part_id = ? AND f.job_id IS NULL AND f.note_id IS NULL
           AND (f.mimetype = 'application/pdf' OR LOWER(f.filename) LIKE '%.pdf')
         ORDER BY f.uploaded_at DESC, f.id DESC`,
        [partId]
    );

    const [part] = partRows;
    return {
        part_id: part.id,
        part_number: part.number,
        part_description: part.description,
        jobs,
        drawings: files.map((file) => pick(file, FILE_FIELDS)),
    };
}

module.exports = { listJobs, getJob, listPartFiles, getPartFile, listParts, getPart };
