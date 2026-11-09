const { QcError, validateShape } = require('./qcMarkings');

const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;

const notFound = () => new QcError('Not found', HTTP_NOT_FOUND);

async function requirePartExists(db, partId) {
    const [rows] = await db.execute('SELECT id FROM part WHERE id = ?', [partId]);
    if (rows.length === 0) throw notFound();
}

async function requireDrawing(db, partId, fileId) {
    const [rows] = await db.execute(
        'SELECT id FROM uploaded_files WHERE id = ? AND part_id = ? AND job_id IS NULL AND note_id IS NULL',
        [fileId, partId]
    );
    if (rows.length === 0) throw notFound();
}

// Admins may only change Leemac markings; a client's marking is read-only to them.
async function requireLeemacMarking(db, partId, id) {
    const [rows] = await db.execute('SELECT company_id FROM qc_marking WHERE id = ? AND part_id = ?', [id, partId]);
    if (rows.length === 0) throw notFound();
    if (rows[0].company_id !== null) throw new QcError('Client markings cannot be changed', HTTP_FORBIDDEN);
}

async function listForAdmin(db, partId) {
    const [markings] = await db.execute(
        `SELECT m.id, m.part_id, m.file_id, m.page, m.company_id, c.name AS company_name, m.kind,
                m.x1, m.y1, m.x2, m.y2, m.size, m.note, m.author_name, m.created_at, m.updated_at
         FROM qc_marking m LEFT JOIN company c ON c.id = m.company_id
         WHERE m.part_id = ?
         ORDER BY m.id`,
        [partId]
    );
    const [pings] = await db.execute(
        `SELECT p.company_id, c.name AS company_name, p.pinged_at, p.pinged_by_name, p.ping_count
         FROM qc_ping p JOIN company c ON c.id = p.company_id
         WHERE p.part_id = ?
         ORDER BY p.company_id`,
        [partId]
    );
    return {
        markings: markings.map((row) => ({ ...row, is_leemac: row.company_id === null })),
        pings,
    };
}

async function createLeemacMarking(db, admin, partId, body) {
    await requirePartExists(db, partId);
    const shape = validateShape(body);
    await requireDrawing(db, partId, shape.file_id);
    const [result] = await db.execute(
        `INSERT INTO qc_marking
           (part_id, file_id, page, company_id, kind, x1, y1, x2, y2, size, note,
            author_id, author_name, created_at, updated_at)
         VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [partId, shape.file_id, shape.page, shape.kind, shape.x1, shape.y1,
            shape.x2, shape.y2, shape.size, shape.note, String(admin.id), admin.name]
    );
    return { id: result.insertId };
}

async function updateLeemacMarking(db, partId, id, body) {
    const shape = validateShape(body);
    await requireDrawing(db, partId, shape.file_id);
    await requireLeemacMarking(db, partId, id);
    await db.execute(
        `UPDATE qc_marking
         SET file_id = ?, page = ?, kind = ?, x1 = ?, y1 = ?, x2 = ?, y2 = ?, size = ?, note = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [shape.file_id, shape.page, shape.kind, shape.x1, shape.y1, shape.x2, shape.y2, shape.size,
            shape.note, id]
    );
}

async function deleteLeemacMarking(db, partId, id) {
    await requireLeemacMarking(db, partId, id);
    await db.execute('DELETE FROM qc_photo WHERE marking_id = ?', [id]);
    await db.execute('DELETE FROM qc_marking WHERE id = ?', [id]);
}

async function clearLeemacMarkings(db, partId) {
    await db.execute(
        'DELETE FROM qc_photo WHERE marking_id IN (SELECT id FROM qc_marking WHERE part_id = ? AND company_id IS NULL)',
        [partId]
    );
    await db.execute('DELETE FROM qc_marking WHERE part_id = ? AND company_id IS NULL', [partId]);
}

module.exports = {
    listForAdmin, createLeemacMarking, updateLeemacMarking, deleteLeemacMarking, clearLeemacMarkings,
};
