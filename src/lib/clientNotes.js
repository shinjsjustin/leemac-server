const { ownsJob, ownsPart } = require('./clientPortal');

const CLIENT_PORTAL_ADMIN_EMAIL = 'client-portal@leemac.invalid';
const ADMIN_AUTHOR = 'Leemac';
const NOTE_MAX = 255;

class ClientNoteError extends Error {
    constructor(message, status) {
        super(message);
        this.name = 'ClientNoteError';
        this.status = status;
    }
}

function cleanContent(content) {
    const text = typeof content === 'string' ? content.trim() : '';
    if (text.length < 1 || text.length > NOTE_MAX) {
        throw new ClientNoteError(`content must be 1-${NOTE_MAX} characters`, 400);
    }
    return text;
}

function toNote(row, user) {
    return {
        id: row.id,
        content: row.content,
        author: row.client_name || ADMIN_AUTHOR,
        is_client: row.client_name !== null,
        mine: row.client_id === user.id,
        created_at: row.created_at,
        updated_at: row.updated_at,
        part_id: row.part_id,
        part_number: row.part_number,
    };
}

async function listNotes(db, user) {
    const [rows] = await db.execute(
        `SELECT n.id, n.content, n.client_id, n.client_name, n.created_at, n.updated_at, n.jobid, n.part_id,
                p.number AS part_number
         FROM note n
         LEFT JOIN job j ON n.jobid = j.id
         LEFT JOIN part p ON n.part_id = p.id
         WHERE ((n.jobid IS NOT NULL AND j.company_id = ?) OR (n.part_id IS NOT NULL AND n.company_id = ?))
           AND (n.client_name IS NOT NULL OR n.shared = 1)
         ORDER BY n.id`,
        [user.company_id, user.company_id]
    );
    const [jobParts] = await db.execute(
        `SELECT jp.job_id, jp.part_id
         FROM job_part jp
         JOIN job j ON jp.job_id = j.id
         WHERE j.company_id = ?`,
        [user.company_id]
    );
    const jobsByPart = {};
    for (const { job_id: jobId, part_id: partId } of jobParts) {
        (jobsByPart[partId] = jobsByPart[partId] || []).push(jobId);
    }

    const result = { jobs: {}, parts: {} };
    const file = (group, key, note) => (group[key] = group[key] || []).push(note);
    for (const row of rows) {
        const note = toNote(row, user);
        if (row.part_id === null) {
            file(result.jobs, row.jobid, note);
            continue;
        }
        file(result.parts, row.part_id, note);
        const jobIds = new Set(jobsByPart[row.part_id] || []);
        if (row.jobid !== null) jobIds.add(row.jobid);
        for (const jobId of jobIds) file(result.jobs, jobId, note);
    }
    return result;
}

async function addNote(db, user, body) {
    const { job_id: jobId, part_id: partId } = body;
    const hasJob = jobId !== undefined && jobId !== null;
    const hasPart = partId !== undefined && partId !== null;
    if (hasJob === hasPart) throw new ClientNoteError('Exactly one of job_id or part_id is required', 400);
    const text = cleanContent(body.content);

    const owned = hasJob ? await ownsJob(db, user.company_id, jobId) : await ownsPart(db, user.company_id, partId);
    if (!owned) throw new ClientNoteError(hasJob ? 'Job not found' : 'Part not found', 404);

    const [admins] = await db.execute('SELECT id FROM admin WHERE email = ?', [CLIENT_PORTAL_ADMIN_EMAIL]);
    if (admins.length === 0) throw new ClientNoteError('Client note author missing; apply migration 009', 503);

    const [result] = await db.execute(
        `INSERT INTO note (content, userid, jobid, part_id, company_id, client_id, client_name)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [text, admins[0].id, hasJob ? jobId : null, hasPart ? partId : null, user.company_id, user.id, user.name]
    );
    return { id: result.insertId };
}

async function editNote(db, user, id, body) {
    const text = cleanContent(body.content);
    const [result] = await db.execute(
        'UPDATE note SET content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND client_id = ? AND company_id = ?',
        [text, id, user.id, user.company_id]
    );
    if (result.affectedRows === 0) throw new ClientNoteError('Note not found', 404);
}

async function deleteNote(db, user, id) {
    const [result] = await db.execute(
        'DELETE FROM note WHERE id = ? AND client_id = ? AND company_id = ?',
        [id, user.id, user.company_id]
    );
    if (result.affectedRows === 0) throw new ClientNoteError('Note not found', 404);
}

module.exports = { ClientNoteError, listNotes, addNote, editNote, deleteNote };
