const BOURNE_ADMIN_EMAIL = 'bourne@bourne.invalid';
const NOTE_MAX = 255; // note.content is VARCHAR(255)

class JobNoteError extends Error {
    constructor(message, status) {
        super(message);
        this.name = 'JobNoteError';
        this.status = status;
    }
}

async function addBourneNote(db, jobId, content) {
    const text = typeof content === 'string' ? content.trim() : '';
    if (!text || text.length > NOTE_MAX) {
        throw new JobNoteError(`content must be 1-${NOTE_MAX} characters`, 400);
    }

    const [admins] = await db.execute('SELECT id FROM admin WHERE email = ?', [BOURNE_ADMIN_EMAIL]);
    if (admins.length === 0) {
        throw new JobNoteError('Bourne note author missing; apply migration 007', 503);
    }

    const [result] = await db.execute(
        'INSERT INTO note (content, userid, jobid) VALUES (?, ?, ?)',
        [text, admins[0].id, jobId]
    );
    return { id: result.insertId };
}

module.exports = { BOURNE_ADMIN_EMAIL, JobNoteError, addBourneNote };
