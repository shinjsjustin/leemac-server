const STAR_FLAGS = ['urgent', 'waiting'];

const STAR_LOOKUP = {
    jobPartId: 's.job_part_id',
    starId: 's.id',
    nfcTagId: 's.nfc_tag_id',
};

async function findStar(db, where, column) {
    const [key] = Object.keys(where);
    const [rows] = await db.execute(
        `SELECT s.id, s.job_part_id, s.${column}, jp.job_id, j.company_id
         FROM stars s
         JOIN job_part jp ON s.job_part_id = jp.id
         JOIN job j ON jp.job_id = j.id
         WHERE ${STAR_LOOKUP[key]} = ?`,
        [where[key]]
    );
    return rows[0] || null;
}

// Sets a star's status and logs the change; returns null when no star matches.
async function changeStarStatus(db, where, status, source) {
    const star = await findStar(db, where, 'status');
    if (!star) return null;
    if (star.status === status) return { changed: false };

    await db.execute(`UPDATE stars SET status = ? WHERE id = ?`, [status, star.id]);
    await db.execute(
        `INSERT INTO star_status_history (job_part_id, job_id, company_id, kind, from_status, to_status, source)
         VALUES (?, ?, ?, 'status', ?, ?, ?)`,
        [star.job_part_id, star.job_id, star.company_id, star.status, status, source]
    );
    return { changed: true };
}

// Sets the urgent or waiting flag and logs the change; returns null when no star matches.
async function setStarFlag(db, where, flag, on, source) {
    if (!STAR_FLAGS.includes(flag)) throw new Error(`Invalid star flag: ${flag}`);
    const star = await findStar(db, where, flag);
    if (!star) return null;

    const from = star[flag] ? 1 : 0;
    const to = on ? 1 : 0;
    if (from === to) return { changed: false };

    await db.execute(`UPDATE stars SET ${flag} = ? WHERE id = ?`, [to, star.id]);
    await db.execute(
        `INSERT INTO star_status_history (job_part_id, job_id, company_id, kind, from_status, to_status, source)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [star.job_part_id, star.job_id, star.company_id, flag, String(from), String(to), source]
    );
    return { changed: true };
}

module.exports = { changeStarStatus, setStarFlag };
