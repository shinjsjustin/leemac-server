const { ownsPart } = require('./clientPortal');

const KINDS = ['point', 'line', 'box'];
const SIZE_MIN = 1;
const SIZE_MAX = 40;
const NOTE_MAX = 255;
const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;

class QcError extends Error {
    constructor(message, status) {
        super(message);
        this.name = 'QcError';
        this.status = status;
    }
}

const notFound = () => new QcError('Not found', HTTP_NOT_FOUND);
const badRequest = (message) => new QcError(message, HTTP_BAD_REQUEST);

const isFraction = (value) => typeof value === 'number' && value >= 0 && value <= 1;

// Returns the cleaned marking fields, with the ones the kind doesn't use set to null.
function validateShape(body) {
    const { kind, page, x1, y1, x2, y2, size, file_id: fileId } = body;
    const note = body.note === undefined ? null : body.note;
    if (!KINDS.includes(kind)) throw badRequest('kind must be point, line or box');
    if (!Number.isInteger(page) || page < 1) throw badRequest('page must be 1 or more');
    if (!isFraction(x1) || !isFraction(y1)) throw badRequest('x1 and y1 must be between 0 and 1');
    const isPoint = kind === 'point';
    if (!isPoint && (!isFraction(x2) || !isFraction(y2))) throw badRequest('x2 and y2 must be between 0 and 1');
    if (isPoint && !(typeof size === 'number' && size >= SIZE_MIN && size <= SIZE_MAX)) {
        throw badRequest(`size must be ${SIZE_MIN}-${SIZE_MAX}`);
    }
    if (note !== null && (typeof note !== 'string' || note.length > NOTE_MAX)) {
        throw badRequest(`note must be at most ${NOTE_MAX} characters`);
    }
    return {
        file_id: fileId, page, kind, x1, y1,
        x2: isPoint ? null : x2,
        y2: isPoint ? null : y2,
        size: isPoint ? size : null,
        note,
    };
}

async function requirePart(db, user, partId) {
    if (!(await ownsPart(db, user.company_id, partId))) throw notFound();
}

async function requireDrawing(db, partId, fileId) {
    const [rows] = await db.execute(
        'SELECT id FROM uploaded_files WHERE id = ? AND part_id = ? AND job_id IS NULL AND note_id IS NULL',
        [fileId, partId]
    );
    if (rows.length === 0) throw notFound();
}

async function deletePhotosWhere(db, condition, params) {
    await db.execute(
        `DELETE FROM qc_photo WHERE marking_id IN (SELECT id FROM qc_marking WHERE ${condition})`,
        params
    );
}

async function listForClient(db, user, partId) {
    await requirePart(db, user, partId);
    const [rows] = await db.execute(
        `SELECT id, part_id, file_id, page, company_id, kind, x1, y1, x2, y2, size, note,
                author_name, created_at, updated_at
         FROM qc_marking
         WHERE part_id = ? AND (company_id IS NULL OR company_id = ?)
         ORDER BY id`,
        [partId, user.company_id]
    );
    return rows.map((row) => ({
        ...row,
        is_leemac: row.company_id === null,
        mine: row.company_id === user.company_id,
    }));
}

async function createMarking(db, user, partId, body) {
    await requirePart(db, user, partId);
    const shape = validateShape(body);
    await requireDrawing(db, partId, shape.file_id);
    const [result] = await db.execute(
        `INSERT INTO qc_marking
           (part_id, file_id, page, company_id, kind, x1, y1, x2, y2, size, note,
            author_id, author_name, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [partId, shape.file_id, shape.page, user.company_id, shape.kind, shape.x1, shape.y1,
            shape.x2, shape.y2, shape.size, shape.note, String(user.id), user.name]
    );
    return { id: result.insertId };
}

async function updateMarking(db, user, partId, id, body) {
    await requirePart(db, user, partId);
    const shape = validateShape(body);
    await requireDrawing(db, partId, shape.file_id);
    const [result] = await db.execute(
        `UPDATE qc_marking
         SET file_id = ?, page = ?, kind = ?, x1 = ?, y1 = ?, x2 = ?, y2 = ?, size = ?, note = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND part_id = ? AND company_id = ?`,
        [shape.file_id, shape.page, shape.kind, shape.x1, shape.y1, shape.x2, shape.y2, shape.size,
            shape.note, id, partId, user.company_id]
    );
    if (result.affectedRows === 0) throw notFound();
}

async function deleteMarking(db, user, partId, id) {
    await requirePart(db, user, partId);
    const condition = 'id = ? AND part_id = ? AND company_id = ?';
    const params = [id, partId, user.company_id];
    await deletePhotosWhere(db, condition, params);
    const [result] = await db.execute(`DELETE FROM qc_marking WHERE ${condition}`, params);
    if (result.affectedRows === 0) throw notFound();
}

async function clearMarkings(db, user, partId) {
    await requirePart(db, user, partId);
    const condition = 'part_id = ? AND company_id = ?';
    const params = [partId, user.company_id];
    await deletePhotosWhere(db, condition, params);
    await db.execute(`DELETE FROM qc_marking WHERE ${condition}`, params);
}

async function ping(db, user, partId) {
    await requirePart(db, user, partId);
    const [marks] = await db.execute(
        'SELECT id FROM qc_marking WHERE part_id = ? AND company_id = ? LIMIT 1',
        [partId, user.company_id]
    );
    if (marks.length === 0) throw badRequest('Add a marking before pinging');

    const [existing] = await db.execute(
        'SELECT id FROM qc_ping WHERE part_id = ? AND company_id = ?',
        [partId, user.company_id]
    );
    if (existing.length === 0) {
        await db.execute(
            `INSERT INTO qc_ping (part_id, company_id, pinged_by_name, pinged_at, ping_count, dismissed_at)
             VALUES (?, ?, ?, CURRENT_TIMESTAMP, 1, NULL)`,
            [partId, user.company_id, user.name]
        );
        return;
    }
    await db.execute(
        `UPDATE qc_ping
         SET pinged_by_name = ?, pinged_at = CURRENT_TIMESTAMP, ping_count = ping_count + 1, dismissed_at = NULL
         WHERE id = ?`,
        [user.name, existing[0].id]
    );
}

module.exports = {
    QcError, validateShape, listForClient, createMarking, updateMarking, deleteMarking, clearMarkings, ping,
};
