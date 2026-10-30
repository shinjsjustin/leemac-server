const { jobStage, dueFlag, stageIndex, stageLabel } = require('./shopStages');
const { getWindow } = require('./portalSchedule');

const byJobNumber = (a, b) => String(a.job.job_number).localeCompare(String(b.job.job_number));

// Every starred job from any company with its star statuses; no price or cost columns.
async function loadStarredJobs(db) {
    const [rows] = await db.execute(
        `SELECT j.id, j.job_number, j.invoice_date, j.created_at, j.due_date, j.ship_date, c.name AS company_name,
                (SELECT COUNT(*) FROM job_part n WHERE n.job_id = j.id) AS part_count, s.status AS star_status
         FROM job j
         JOIN company c ON c.id = j.company_id
         JOIN job_part jp ON jp.job_id = j.id
         JOIN stars s ON s.job_part_id = jp.id
         ORDER BY j.id`
    );
    const jobs = new Map();
    for (const row of rows) {
        if (!jobs.has(row.id)) jobs.set(row.id, { job: row, statuses: [] });
        jobs.get(row.id).statuses.push(row.star_status);
    }
    return [...jobs.values()].map(({ job, statuses }) => ({ job, stage: jobStage(job, statuses) }));
}

async function getAdminSchedule(db, now = new Date()) {
    const jobs = await loadStarredJobs(db);
    const board = [...jobs]
        .sort((a, b) => stageIndex(a.stage) - stageIndex(b.stage) || byJobNumber(a, b))
        .map(({ job, stage }) => ({
            id: job.id, job_number: job.job_number, company_name: job.company_name, stage: stageLabel(stage),
            part_count: job.part_count, created_at: job.created_at ?? null, due_date: job.due_date ?? null,
            flag: dueFlag(job, stage, now), own: true,
        }));
    const undated = jobs
        .filter(({ job }) => !job.ship_date && !job.due_date)
        .sort(byJobNumber)
        .map(({ job, stage }) => ({ id: job.id, job_number: job.job_number, company_name: job.company_name, stage: stageLabel(stage) }));
    return { window: getWindow(now), board, undated };
}

module.exports = { getAdminSchedule };
