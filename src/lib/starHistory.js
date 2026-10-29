const STAR_LOOKUP = {
    jobPartId: 's.job_part_id',
    starId: 's.id',
    nfcTagId: 's.nfc_tag_id',
};

// Sets a star's status and logs the change; returns null when no star matches.
async function changeStarStatus(db, where, status, source) {
    const [key] = Object.keys(where);
    const [rows] = await db.execute(
        `SELECT s.id, s.job_part_id, s.status, jp.job_id, j.company_id
         FROM stars s
         JOIN job_part jp ON s.job_part_id = jp.id
         JOIN job j ON jp.job_id = j.id
         WHERE ${STAR_LOOKUP[key]} = ?`,
        [where[key]]
    );
    if (!rows.length) return null;

    const star = rows[0];
    if (star.status === status) return { changed: false };

    await db.execute(`UPDATE stars SET status = ? WHERE id = ?`, [status, star.id]);
    await db.execute(
        `INSERT INTO star_status_history (job_part_id, job_id, company_id, from_status, to_status, source)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [star.job_part_id, star.job_id, star.company_id, star.status, status, source]
    );
    return { changed: true };
}

module.exports = { changeStarStatus };
