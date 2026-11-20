const NOTE_COLUMNS = `n.id, n.content, n.part_id, part.number AS part_number,
       COALESCE(n.client_name, a.name) AS author,
       CASE WHEN n.client_name IS NULL THEN 0 ELSE 1 END AS is_client,
       n.shared, n.created_at`;

// A note is on job J when it is written on J, or pinned to a part on J for J's company.
// Old admin part notes have no company_id, so they fall back to their own job's company.
async function loadJobNotes(db, jobIds) {
    if (jobIds.length === 0) return [];
    const marks = jobIds.map(() => '?').join(', ');
    const [rows] = await db.execute(
        `SELECT j.id AS job_id, ${NOTE_COLUMNS}
         FROM job j
         JOIN note n ON n.jobid = j.id
           OR (n.part_id IN (SELECT jp.part_id FROM job_part jp WHERE jp.job_id = j.id)
               AND COALESCE(n.company_id, (SELECT oj.company_id FROM job oj WHERE oj.id = n.jobid)) = j.company_id)
         JOIN admin a ON n.userid = a.id
         LEFT JOIN part ON part.id = n.part_id
         WHERE j.id IN (${marks})
         ORDER BY n.id`,
        jobIds
    );
    return rows;
}

async function loadPartNotes(db, partId) {
    const [rows] = await db.execute(
        `SELECT ${NOTE_COLUMNS}, j.job_number
         FROM note n
         JOIN admin a ON n.userid = a.id
         LEFT JOIN part ON part.id = n.part_id
         LEFT JOIN job j ON j.id = n.jobid
         WHERE n.part_id = ?
         ORDER BY n.id`,
        [partId]
    );
    return rows;
}

module.exports = { loadJobNotes, loadPartNotes };
