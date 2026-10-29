const { listJobs } = require('./portal');
const { stageOf, stageIndex, stageLabel, dayNumber, jobStage, dueFlag } = require('./shopStages');
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

const ON_TIME_WINDOW_DAYS = 90;
const WALL_SIZE = 12;
const DONE_INDEX = stageIndex('done');

// One row per job part (or one bare row for a job with none), dates and star status only.
async function loadJobRows(db, companyId) {
    const [rows] = await db.execute(
        `SELECT j.id AS job_id, j.job_number, j.due_date, j.ship_date, j.invoice_date,
                jp.id AS job_part_id, jp.rev, p.id AS part_id, p.number AS part_number, s.status AS star_status
         FROM job j
         LEFT JOIN job_part jp ON jp.job_id = j.id
         LEFT JOIN part p ON jp.part_id = p.id
         LEFT JOIN stars s ON s.job_part_id = jp.id
         WHERE j.company_id = ?`,
        [companyId]
    );
    return rows;
}

async function loadLineCounts(db, companyId) {
    const [rows] = await db.execute(
        `SELECT l.request_id, COUNT(*) AS line_count
         FROM quote_request_line l
         JOIN quote_request r ON r.id = l.request_id
         WHERE r.company_id = ?
         GROUP BY l.request_id`,
        [companyId]
    );
    return new Map(rows.map((r) => [r.request_id, Number(r.line_count)]));
}

function buildHeadline(rows, now) {
    const jobs = new Map();
    for (const row of rows) {
        if (!jobs.has(row.job_id)) jobs.set(row.job_id, { job: row, statuses: [] });
        if (row.star_status) jobs.get(row.job_id).statuses.push(row.star_status);
    }
    const headline = {
        active_jobs: 0, due_soon: 0, overdue: 0, on_time_rate: null, parts_in_shop: 0,
        next_due: null, shipped_on_time: 0, shipped_total: 0,
    };
    const today = dayNumber(now);
    for (const { job, statuses } of jobs.values()) {
        if (!job.ship_date) {
            headline.active_jobs += 1;
            const flag = dueFlag(job, jobStage(job, statuses), now);
            if (flag) headline[flag] += 1;
            const isUpcoming = job.due_date && dayNumber(job.due_date) >= today;
            if (isUpcoming && (!headline.next_due || dayNumber(job.due_date) < dayNumber(headline.next_due))) headline.next_due = job.due_date;
        } else if (job.due_date && today - dayNumber(job.ship_date) <= ON_TIME_WINDOW_DAYS) {
            headline.shipped_total += 1;
            if (dayNumber(job.ship_date) <= dayNumber(job.due_date)) headline.shipped_on_time += 1;
        }
        headline.parts_in_shop += statuses.filter((status) => stageIndex(stageOf(status)) < DONE_INDEX).length;
    }
    if (headline.shipped_total) headline.on_time_rate = Math.round((100 * headline.shipped_on_time) / headline.shipped_total);
    return headline;
}

function buildWall(rows, parts) {
    const drawingOf = new Map(parts.map((part) => [part.part_id, part.drawings[0] || null]));
    return rows
        .filter((row) => row.star_status)
        .map((row) => ({ row, stageKey: stageOf(row.star_status) }))
        .sort((a, b) => stageIndex(a.stageKey) - stageIndex(b.stageKey) || a.row.job_part_id - b.row.job_part_id)
        .slice(0, WALL_SIZE)
        .map(({ row, stageKey }) => {
            return {
                job_part_id: row.job_part_id, part_id: row.part_id, part_number: row.part_number, rev: row.rev,
                job_id: row.job_id, job_number: row.job_number, stage: stageLabel(stageKey),
                drawing: drawingOf.get(row.part_id) || null,
            };
        });
}

async function getOverview(db, user, query, now = new Date()) {
    const [{ jobs, pagination }, parts, lists, requestRows, jobRows, lineCounts] = await Promise.all([
        listJobs(db, user.company_id, query, now),
        loadParts(db, user.company_id),
        listLists(db, user),
        listRequests(db, user),
        loadJobRows(db, user.company_id),
        loadLineCounts(db, user.company_id),
    ]);
    const requests = requestRows.map((request) => ({ ...request, line_count: lineCounts.get(request.id) || 0 }));
    return {
        headline: buildHeadline(jobRows, now), jobs, pagination, parts, lists, requests, wall: buildWall(jobRows, parts),
    };
}

module.exports = { getOverview };
