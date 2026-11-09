const { QcError } = require('./qcMarkings');

const HTTP_NOT_FOUND = 404;
const CLOSED_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const STATUS = { open: 'open', answered: 'answered', dismissed: 'dismissed' };

const time = (value) => new Date(value).getTime();

// A ping whose markings were all deleted stays open until dismissed.
// When every client marking of the ping's company has a photo since it, that is the latest of
// each marking's first such photo; null while any marking is still waiting.
function answeredAt(markings) {
    if (markings.length === 0 || markings.some((m) => m.first_since === null)) return null;
    return markings.reduce((latest, m) => (time(m.first_since) > time(latest) ? m.first_since : latest), markings[0].first_since);
}

async function loadRequests(db) {
    const [pings] = await db.execute(
        `SELECT pg.id, pg.company_id, c.name AS company_name, pg.pinged_by_name AS contact,
                pg.part_id, p.number AS part_number, pg.pinged_at, pg.ping_count, pg.dismissed_at,
                (SELECT j.id FROM job_part jp JOIN job j ON j.id = jp.job_id
                 WHERE jp.part_id = pg.part_id AND j.company_id = pg.company_id
                 ORDER BY j.created_at DESC, j.id DESC LIMIT 1) AS newest_job_id,
                (SELECT j.job_number FROM job_part jp JOIN job j ON j.id = jp.job_id
                 WHERE jp.part_id = pg.part_id AND j.company_id = pg.company_id
                 ORDER BY j.created_at DESC, j.id DESC LIMIT 1) AS newest_job_number,
                (SELECT COUNT(*) FROM qc_marking m
                 WHERE m.part_id = pg.part_id AND m.company_id = pg.company_id) AS marking_count,
                (SELECT COUNT(*) FROM qc_photo ph JOIN qc_marking m ON m.id = ph.marking_id
                 WHERE m.part_id = pg.part_id AND m.company_id = pg.company_id) AS photo_count
         FROM qc_ping pg
         JOIN company c ON c.id = pg.company_id
         JOIN part p ON p.id = pg.part_id`
    );
    const [firsts] = await db.execute(
        `SELECT pg.id AS ping_id, MIN(ph.uploaded_at) AS first_since
         FROM qc_ping pg
         JOIN qc_marking m ON m.part_id = pg.part_id AND m.company_id = pg.company_id
         LEFT JOIN qc_photo ph ON ph.marking_id = m.id AND ph.uploaded_at >= pg.pinged_at
         GROUP BY pg.id, m.id`
    );
    return pings.map((row) => {
        const answered = answeredAt(firsts.filter((f) => f.ping_id === row.id));
        const { dismissed_at: dismissedAt, ...rest } = row;
        const status = dismissedAt ? STATUS.dismissed : answered ? STATUS.answered : STATUS.open;
        return {
            ...rest,
            marking_count: Number(row.marking_count),
            photo_count: Number(row.photo_count),
            status,
            closed_at: status === STATUS.dismissed ? dismissedAt : status === STATUS.answered ? answered : null,
        };
    });
}

async function listRequests(db) {
    const windowStart = Date.now() - CLOSED_WINDOW_MS;
    const rows = await loadRequests(db);
    const open = rows.filter((r) => r.status === STATUS.open).sort((a, b) => time(b.pinged_at) - time(a.pinged_at));
    const closed = rows
        .filter((r) => r.status !== STATUS.open && time(r.closed_at) >= windowStart)
        .sort((a, b) => time(b.closed_at) - time(a.closed_at));
    return [...open, ...closed];
}

async function openCount(db) {
    const rows = await loadRequests(db);
    return rows.filter((r) => r.status === STATUS.open).length;
}

async function dismiss(db, id) {
    const [result] = await db.execute('UPDATE qc_ping SET dismissed_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
    if (result.affectedRows === 0) throw new QcError('Not found', HTTP_NOT_FOUND);
}

module.exports = { listRequests, openCount, dismiss };
