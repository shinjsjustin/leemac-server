// Every job_part of the job, starred or not; changed_at reads star_status_history like adminOverview.
async function getJobStages(db, jobId) {
    const [rows] = await db.execute(
        `SELECT jp.id AS job_part_id, s.job_part_id AS starred_part_id, s.status, s.urgent, s.waiting,
                (SELECT MAX(h.changed_at) FROM star_status_history h
                 WHERE h.job_part_id = jp.id AND h.kind = 'status') AS changed_at
         FROM job_part jp
         LEFT JOIN stars s ON s.job_part_id = jp.id
         WHERE jp.job_id = ?
         ORDER BY jp.id`,
        [jobId]
    );
    return rows.map((r) => ({
        job_part_id: r.job_part_id,
        starred: r.starred_part_id != null,
        status: r.status ?? null,
        urgent: Boolean(r.urgent),
        waiting: Boolean(r.waiting),
        changed_at: r.changed_at ?? null,
    }));
}

module.exports = { getJobStages };
