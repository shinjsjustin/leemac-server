const crypto = require('node:crypto');
const { ownsPart } = require('./clientPortal');
const { latestDocuments } = require('./jobDocuments');
const { listForAdmin } = require('./qcLeemacMarkings');
const { listForClient } = require('./qcPhotos');

const HTTP_BAD_REQUEST = 400;
const HTTP_CONFLICT = 409;
const TOKEN_BYTES = 32;
const LIVE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const QUOTE = 'quote';
const QC = 'qc';

class ShareLinkError extends Error {
    constructor(status, message) {
        super(message);
        this.name = 'ShareLinkError';
        this.status = status;
    }
}

const pad = (n) => String(n).padStart(2, '0');
// Local time as 'YYYY-MM-DD HH:MM:SS', the form mysql2 writes for a Date, so it compares in SQL.
const sqlTime = (d) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

const parseJson = (value) => (typeof value === 'string' ? JSON.parse(value) : value);
const isId = (value) => Number.isInteger(value) && value > 0;

const LINK_COLUMNS = 'id, type, token, job_id, part_id, company_id, created_at, expires_at, open_count, last_opened_at';

// Admin side. QC links are per company; a quote link takes its company from the job.
async function getLink(db, type, targetId, companyId) {
    const isQuote = type === QUOTE;
    const [rows] = await db.execute(
        `SELECT ${LINK_COLUMNS} FROM share_link
         WHERE type = ? AND ${isQuote ? 'job_id' : 'part_id'} = ? ${isQuote ? '' : 'AND company_id = ?'}
           AND turned_off_at IS NULL AND expires_at > ?
         ORDER BY id DESC LIMIT 1`,
        isQuote ? [type, targetId, sqlTime(new Date())] : [type, targetId, companyId, sqlTime(new Date())]
    );
    return rows[0] || null;
}

async function quoteCompany(db, jobId) {
    const [rows] = await db.execute(
        `SELECT j.company_id FROM job j JOIN job_document d ON d.job_id = j.id AND d.type = 'quote' WHERE j.id = ?`,
        [jobId]
    );
    if (rows.length === 0) throw new ShareLinkError(HTTP_CONFLICT, 'Save the quote first');
    return rows[0].company_id;
}

async function qcCompany(db, partId, companyId) {
    if (!isId(companyId) || !(await ownsPart(db, companyId, partId))) {
        throw new ShareLinkError(HTTP_BAD_REQUEST, 'That company does not own this part');
    }
    return companyId;
}

async function companiesForPart(db, partId) {
    const [rows] = await db.execute(
        `SELECT DISTINCT c.id, c.name FROM job_part jp
         JOIN job j ON j.id = jp.job_id JOIN company c ON c.id = j.company_id
         WHERE jp.part_id = ? ORDER BY c.name`,
        [partId]
    );
    const owned = await Promise.all(rows.map((c) => ownsPart(db, c.id, partId)));
    return rows.filter((_, i) => owned[i]).map(({ id, name }) => ({ id, name }));
}

async function createLink(db, admin, body) {
    const { type, target_id: targetId, company_id: bodyCompanyId } = body ?? {};
    if (![QUOTE, QC].includes(type) || !isId(targetId)) {
        throw new ShareLinkError(HTTP_BAD_REQUEST, 'type and target_id are required');
    }
    const companyId = type === QUOTE ? await quoteCompany(db, targetId) : await qcCompany(db, targetId, bodyCompanyId);
    const live = await getLink(db, type, targetId, companyId);
    if (live) return live;

    const now = new Date();
    const token = crypto.randomBytes(TOKEN_BYTES).toString('base64url');
    const [result] = await db.execute(
        `INSERT INTO share_link
           (type, token, job_id, part_id, company_id, created_by_id, created_by_name, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [type, token, type === QUOTE ? targetId : null, type === QC ? targetId : null, companyId,
            String(admin.id), admin.name, sqlTime(now), sqlTime(new Date(now.getTime() + LIVE_DAYS * DAY_MS))]
    );
    const [[link]] = await db.execute(`SELECT ${LINK_COLUMNS} FROM share_link WHERE id = ?`, [result.insertId]);
    return link;
}

async function turnOff(db, id) {
    await db.execute('UPDATE share_link SET turned_off_at = ? WHERE id = ? AND turned_off_at IS NULL', [
        sqlTime(new Date()), id,
    ]);
}

// Public side. The link of this type that is on and unexpired, or null.
async function liveLink(db, type, token) {
    const [rows] = await db.execute(
        `SELECT id, job_id, part_id, company_id FROM share_link
         WHERE token = ? AND type = ? AND turned_off_at IS NULL AND expires_at > ?`,
        [String(token), type, sqlTime(new Date())]
    );
    return rows[0] || null;
}

// Counts an open only when the link is live; null otherwise.
async function openLink(db, type, token) {
    const link = await liveLink(db, type, token);
    if (!link) return null;
    await db.execute('UPDATE share_link SET open_count = open_count + 1, last_opened_at = ? WHERE id = ?', [
        sqlTime(new Date()), link.id,
    ]);
    return link;
}

async function openQuote(db, token) {
    const link = await openLink(db, QUOTE, token);
    if (!link) return null;
    const [rows] = await db.execute(
        `SELECT d.fields, d.parts, d.saved_at, c.name AS company_name
         FROM job_document d JOIN job j ON j.id = d.job_id JOIN company c ON c.id = j.company_id
         WHERE d.job_id = ? AND d.type = 'quote'`,
        [link.job_id]
    );
    if (rows.length === 0) return null;
    const { fields, parts, saved_at: savedAt, company_name: companyName } = rows[0];
    return { fields: parseJson(fields), parts: parseJson(parts), saved_at: savedAt, company_name: companyName };
}

const FILE_COLUMNS = 'filename, mimetype, content';

async function quotePdf(db, token) {
    const link = await liveLink(db, QUOTE, token);
    if (!link) return null;
    const { quote } = await latestDocuments(db, link.job_id);
    if (!quote) return null;
    const [rows] = await db.execute(`SELECT ${FILE_COLUMNS} FROM uploaded_files WHERE id = ?`, [quote.id]);
    return rows[0] || null;
}

const MARKING_FIELDS = ['id', 'file_id', 'page', 'kind', 'x1', 'y1', 'x2', 'y2', 'size', 'note'];
const PHOTO_FIELDS = ['id', 'marking_id', 'position', 'value', 'caption', 'mimetype', 'size', 'uploaded_at'];

const pick = (row, fields) => Object.fromEntries(fields.map((f) => [f, row[f]]));

async function openQc(db, token) {
    // Check ownership first: a company that lost the part must not count an open or reach the 404 in listForClient.
    const live = await liveLink(db, QC, token);
    if (!live || !(await ownsPart(db, live.company_id, live.part_id))) return null;
    const link = await openLink(db, QC, token);
    if (!link) return null;
    const [[part]] = await db.execute('SELECT number, description FROM part WHERE id = ?', [link.part_id]);
    const { markings } = await listForAdmin(db, link.part_id);
    const jobs = await listForClient(db, { company_id: link.company_id }, link.part_id);
    return {
        part,
        markings: markings.filter((m) => m.is_leemac).map((m) => pick(m, MARKING_FIELDS)),
        photos: jobs.flatMap((job) => job.photos).map((p) => pick(p, PHOTO_FIELDS)),
    };
}

async function qcDrawing(db, token, fileId) {
    const link = await liveLink(db, QC, token);
    if (!link) return null;
    const [rows] = await db.execute(
        `SELECT f.${FILE_COLUMNS.split(', ').join(', f.')} FROM uploaded_files f
         WHERE f.id = ? AND f.part_id = ? AND f.job_id IS NULL AND f.note_id IS NULL
           AND EXISTS (SELECT 1 FROM qc_marking m WHERE m.file_id = f.id AND m.part_id = f.part_id AND m.company_id IS NULL)`,
        [fileId, link.part_id]
    );
    return rows[0] || null;
}

async function qcPhoto(db, token, photoId) {
    const link = await liveLink(db, QC, token);
    if (!link) return null;
    const [rows] = await db.execute(
        `SELECT p.mimetype, p.content FROM qc_photo p
         JOIN qc_marking m ON m.id = p.marking_id JOIN job j ON j.id = p.job_id
         WHERE p.id = ? AND m.part_id = ? AND j.company_id = ?`,
        [photoId, link.part_id, link.company_id]
    );
    return rows[0] || null;
}

module.exports = {
    ShareLinkError, getLink, companiesForPart, createLink, turnOff, openQuote, openQc, quotePdf, qcDrawing, qcPhoto,
};
