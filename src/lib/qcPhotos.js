const { QcError } = require('./qcMarkings');
const { ownsPart } = require('./clientPortal');

const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;
const MAX_BYTES = 3 * 1024 * 1024;
const MIMETYPES = ['image/jpeg', 'image/png', 'image/webp'];
const VALUE_MAX = 64;
const CAPTION_MAX = 255;

const notFound = () => new QcError('Not found', HTTP_NOT_FOUND);
const badRequest = (message) => new QcError(message, HTTP_BAD_REQUEST);

function validateFile(file) {
    if (!file || !Buffer.isBuffer(file.buffer)) throw badRequest('A photo is required');
    if (!MIMETYPES.includes(file.mimetype)) throw badRequest('Photo must be a JPEG, PNG or WebP');
    if (file.buffer.length > MAX_BYTES) throw badRequest('Photo must be 3 MB or smaller');
}

// Returns value and caption with absent fields as null.
function validateText({ value = null, caption = null }) {
    if (value !== null && (typeof value !== 'string' || value.length > VALUE_MAX)) {
        throw badRequest(`value must be at most ${VALUE_MAX} characters`);
    }
    if (caption !== null && (typeof caption !== 'string' || caption.length > CAPTION_MAX)) {
        throw badRequest(`caption must be at most ${CAPTION_MAX} characters`);
    }
    return { value, caption };
}

// The job must hold the marking's part, and on a client marking belong to its company.
async function requireJob(db, marking, jobId) {
    const [rows] = await db.execute(
        `SELECT j.company_id FROM job_part jp JOIN job j ON j.id = jp.job_id
         WHERE jp.job_id = ? AND jp.part_id = ? LIMIT 1`,
        [jobId, marking.part_id]
    );
    if (rows.length === 0) throw badRequest('That job does not hold this part');
    if (marking.company_id !== null && rows[0].company_id !== marking.company_id) {
        throw badRequest("That job is not this marking's company's");
    }
}

async function addPhoto(db, admin, markingId, { job_id: jobId, value, caption, file }) {
    const [markings] = await db.execute('SELECT part_id, company_id FROM qc_marking WHERE id = ?', [markingId]);
    if (markings.length === 0) throw notFound();
    validateFile(file);
    const text = validateText({ value, caption });
    await requireJob(db, markings[0], jobId);
    const [[next]] = await db.execute(
        'SELECT COALESCE(MAX(position), 0) + 1 AS position FROM qc_photo WHERE marking_id = ?',
        [markingId]
    );
    const [result] = await db.execute(
        `INSERT INTO qc_photo
           (marking_id, job_id, position, value, caption, mimetype, size, content, uploaded_by_name, uploaded_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [markingId, jobId, next.position, text.value, text.caption, file.mimetype, file.buffer.length,
            file.buffer, admin.name]
    );
    return { id: result.insertId };
}

async function updatePhoto(db, id, body) {
    const text = validateText(body);
    const [result] = await db.execute('UPDATE qc_photo SET value = ?, caption = ? WHERE id = ?', [
        text.value, text.caption, id,
    ]);
    if (result.affectedRows === 0) throw notFound();
}

async function reorderPhotos(db, markingId, ids) {
    const [existing] = await db.execute('SELECT id FROM qc_photo WHERE marking_id = ?', [markingId]);
    const isExact = Array.isArray(ids) && ids.length === existing.length
        && new Set(ids).size === ids.length
        && existing.every((row) => ids.includes(row.id));
    if (!isExact) throw badRequest("ids must list every photo of the marking exactly once");
    for (const [index, id] of ids.entries()) {
        await db.execute('UPDATE qc_photo SET position = ? WHERE id = ?', [index + 1, id]);
    }
}

async function deletePhoto(db, id) {
    const [result] = await db.execute('DELETE FROM qc_photo WHERE id = ?', [id]);
    if (result.affectedRows === 0) throw notFound();
}

// Metadata only, grouped by job, newest job first. companyId limits the jobs shown.
async function listGrouped(db, partId, companyId) {
    const [rows] = await db.execute(
        `SELECT p.id, p.marking_id, p.position, p.value, p.caption, p.mimetype, p.size,
                p.uploaded_by_name, p.uploaded_at,
                j.id AS job_id, j.job_number, j.ship_date, j.po_number, j.created_at,
                (SELECT SUM(jp.quantity) FROM job_part jp WHERE jp.job_id = j.id AND jp.part_id = m.part_id) AS quantity
         FROM qc_photo p
         JOIN qc_marking m ON m.id = p.marking_id
         JOIN job j ON j.id = p.job_id
         WHERE m.part_id = ? ${companyId === undefined ? '' : 'AND j.company_id = ?'}
         ORDER BY j.created_at DESC, j.id DESC, p.marking_id, p.position`,
        companyId === undefined ? [partId] : [partId, companyId]
    );
    const jobs = new Map();
    for (const row of rows) {
        const { job_id: jobId, job_number: jobNumber, ship_date: shipDate, po_number: poNumber, created_at: _c,
            quantity, ...photo } = row;
        if (!jobs.has(jobId)) {
            jobs.set(jobId, {
                job_id: jobId, job_number: jobNumber, ship_date: shipDate, po_number: poNumber,
                quantity: Number(quantity), photos: [],
            });
        }
        jobs.get(jobId).photos.push(photo);
    }
    return [...jobs.values()];
}

const listForAdmin = (db, partId) => listGrouped(db, partId);

async function listForClient(db, user, partId) {
    if (!(await ownsPart(db, user.company_id, partId))) throw notFound();
    return listGrouped(db, partId, user.company_id);
}

async function getPhotoForClient(db, user, id) {
    const [rows] = await db.execute(
        `SELECT p.mimetype, p.content FROM qc_photo p JOIN job j ON j.id = p.job_id
         WHERE p.id = ? AND j.company_id = ?`,
        [id, user.company_id]
    );
    if (rows.length === 0) throw notFound();
    return rows[0];
}

module.exports = {
    addPhoto, updatePhoto, reorderPhotos, deletePhoto, listForAdmin, listForClient, getPhotoForClient,
};
