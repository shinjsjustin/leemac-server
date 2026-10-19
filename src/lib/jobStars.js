const { VALID_STAR_STATUSES } = require('../routes/job/shared');

const BAD_REQUEST = 400;
const NOT_FOUND = 404;
const DEFAULT_STATUS = 'open';

class JobStarError extends Error {
    constructor(message, status) {
        super(message);
        this.name = 'JobStarError';
        this.status = status;
    }
}

const cleanText = (value) => {
    const text = value != null ? String(value).trim() : '';
    return text === '' ? null : text;
};

async function findJobPart(db, jobId, jobPartId) {
    const [rows] = await db.execute(
        `SELECT jp.id, j.attention, c.name AS company_name
         FROM job_part jp
         JOIN job j ON jp.job_id = j.id
         JOIN company c ON j.company_id = c.id
         WHERE jp.id = ? AND jp.job_id = ?`,
        [jobPartId, jobId]
    );
    if (rows.length === 0) throw new JobStarError('Job part not found', NOT_FOUND);
    return rows[0];
}

// Stars one job part; an existing star is left untouched.
async function starJobPart(db, jobId, jobPartId, body) {
    const input = body || {};
    const status = input.status === undefined ? DEFAULT_STATUS : input.status;
    if (!VALID_STAR_STATUSES.includes(status)) {
        throw new JobStarError('Invalid status', BAD_REQUEST);
    }

    const jobPart = await findJobPart(db, jobId, jobPartId);
    const [existing] = await db.execute(`SELECT id FROM stars WHERE job_part_id = ?`, [jobPartId]);
    if (existing.length > 0) return { starred: true, created: false };

    const attention = cleanText(input.attention) || cleanText(jobPart.attention) || jobPart.company_name;
    await db.execute(
        `INSERT INTO stars (job_part_id, attention, status) VALUES (?, ?, ?)`,
        [jobPartId, attention, status]
    );
    return { starred: true, created: true };
}

async function unstarJobPart(db, jobId, jobPartId) {
    await findJobPart(db, jobId, jobPartId);
    await db.execute(`DELETE FROM stars WHERE job_part_id = ?`, [jobPartId]);
    return { starred: false };
}

module.exports = { JobStarError, starJobPart, unstarJobPart };
