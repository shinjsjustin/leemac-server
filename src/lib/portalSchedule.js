const { STAGES, jobStage, dueFlag, stageOf } = require('./shopStages');

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const WINDOW_DAYS = 28;
const TICKER_DAYS = 7;
const TICKER_LIMIT = 20;
const DAYS_FROM_THURSDAY_TO_MONDAY = 3; // day 0 (1970-01-01) was a Thursday

const stageIndex = (key) => STAGES.findIndex((s) => s.key === key);

// Calendar-day number; mysql2 gives Date, sqlite gives 'YYYY-MM-DD...' strings.
const dayNumber = (value) => {
    if (value instanceof Date) return Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()) / MS_PER_DAY;
    const [y, m, d] = String(value).slice(0, 10).split('-').map(Number);
    return Date.UTC(y, m - 1, d) / MS_PER_DAY;
};

const dayString = (day) => new Date(day * MS_PER_DAY).toISOString().slice(0, 10);

function getWindow(now) {
    const today = dayNumber(now);
    const start = today - ((today + DAYS_FROM_THURSDAY_TO_MONDAY) % 7) - 7;
    return { start: dayString(start), end: dayString(start + WINDOW_DAYS) };
}

// One entry per job with the star statuses of its parts; only the columns the schedule needs.
async function loadJobs(db, where, params) {
    const [rows] = await db.execute(
        `SELECT j.id, j.job_number, j.company_id, j.po_date, j.created_at, j.due_date, j.ship_date, j.invoice_date,
                (SELECT COUNT(*) FROM job_part c WHERE c.job_id = j.id) AS part_count, s.status AS star_status
         FROM job j
         LEFT JOIN job_part jp ON jp.job_id = j.id
         LEFT JOIN stars s ON s.job_part_id = jp.id
         WHERE ${where}
         ORDER BY j.id`,
        params
    );
    const jobs = new Map();
    for (const row of rows) {
        if (!jobs.has(row.id)) jobs.set(row.id, { job: row, statuses: [] });
        if (row.star_status) jobs.get(row.id).statuses.push(row.star_status);
    }
    return [...jobs.values()].map(({ job, statuses }) => ({ job, statuses, stage: jobStage(job, statuses) }));
}

const overlaps = (job, window) => {
    const start = dayNumber(job.po_date || job.created_at);
    const end = dayNumber(job.ship_date || job.due_date || job.po_date || job.created_at);
    return start <= dayNumber(window.end) && end >= dayNumber(window.start);
};

async function getSchedule(db, user, now = new Date()) {
    const window = getWindow(now);
    const [own, starred] = await Promise.all([
        loadJobs(db, 'j.company_id = ?', [user.company_id]),
        loadJobs(db, 'EXISTS (SELECT 1 FROM job_part x JOIN stars t ON t.job_part_id = x.id WHERE x.job_id = j.id)', []),
    ]);
    const timeline = own
        .filter(({ job }) => overlaps(job, window))
        .map(({ job, stage }) => ({
            id: job.id, job_number: job.job_number, start: job.po_date || job.created_at,
            due_date: job.due_date, ship_date: job.ship_date, stage, flag: dueFlag(job, stage, now),
        }));
    const board = starred
        .filter(({ statuses }) => statuses.length)
        .sort((a, b) => stageIndex(a.stage) - stageIndex(b.stage) || String(a.job.job_number).localeCompare(String(b.job.job_number)))
        .map(({ job, stage }) => {
            const entry = { job_number: job.job_number, stage, part_count: job.part_count };
            if (job.company_id !== user.company_id) return entry;
            return { id: job.id, ...entry, flag: dueFlag(job, stage, now), own: true };
        });
    return { window, timeline, board };
}

const sqlTimestamp = (date) => date.toISOString().slice(0, 19).replace('T', ' ');

async function getTicker(db, user, now = new Date()) {
    const cutoff = sqlTimestamp(new Date(now.getTime() - TICKER_DAYS * MS_PER_DAY));
    const [rows] = await db.execute(
        `SELECT h.changed_at, h.company_id, h.from_status, h.to_status, j.job_number, p.number AS part_number
         FROM star_status_history h
         JOIN job j ON j.id = h.job_id
         LEFT JOIN job_part jp ON jp.id = h.job_part_id
         LEFT JOIN part p ON p.id = jp.part_id
         WHERE h.changed_at >= ?
         ORDER BY h.changed_at DESC, h.id DESC`,
        [cutoff]
    );
    return rows
        .filter((row) => stageOf(row.from_status) !== stageOf(row.to_status))
        .slice(0, TICKER_LIMIT)
        .map((row) => {
            const event = { at: row.changed_at, job_number: row.job_number, stage: stageOf(row.to_status) };
            if (row.company_id !== user.company_id) return event;
            return { at: event.at, job_number: event.job_number, part_number: row.part_number, stage: event.stage, own: true };
        });
}

module.exports = { getSchedule, getTicker };
