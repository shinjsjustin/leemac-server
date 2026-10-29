const path = require('path');
const multer = require('multer');
const mime = require('mime');
const { QuoteRequestError } = require('./quoteRequests');

const BYTES_PER_MB = 1024 * 1024;
const MAX_FILE_MB = 20;
const MAX_UPLOAD_FILES = 10;
const MAX_REQUEST_FILES = 60;
const GENERIC_MIMETYPE = 'application/octet-stream';

const REQUEST_EXTENSIONS = [
    '.pdf', '.step', '.stp', '.igs', '.iges', '.dxf', '.dwg', '.x_t', '.sldprt', '.png', '.jpg', '.jpeg',
];

const requestUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_FILE_MB * BYTES_PER_MB, files: MAX_UPLOAD_FILES },
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (REQUEST_EXTENSIONS.includes(ext)) return cb(null, true);
        const err = new Error(`File type ${ext || '(none)'} is not allowed`);
        err.code = 'FILE_TYPE_NOT_ALLOWED';
        cb(err, false);
    },
});

// Browsers often send octet-stream for drawings; fall back to the filename.
function resolveMimetype(file) {
    if (file.mimetype && file.mimetype !== GENERIC_MIMETYPE) return file.mimetype;
    return mime.getType(file.originalname) || GENERIC_MIMETYPE;
}

async function withTransaction(db, work) {
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        const result = await work(conn);
        await conn.commit();
        return result;
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
}

// Locks the company's request row; null when it is not theirs, 409 when it is no longer a draft.
async function lockDraft(conn, user, requestId) {
    const [rows] = await conn.execute(
        `SELECT id, status FROM quote_request WHERE id = ? AND company_id = ? FOR UPDATE`,
        [requestId, user.company_id]
    );
    if (!rows.length) return null;
    if (rows[0].status !== 'draft') throw new QuoteRequestError('Only a draft can have files changed.', 409);
    return rows[0];
}

async function addRequestFiles(db, user, requestId, lineId, files) {
    return withTransaction(db, async (conn) => {
        if (!await lockDraft(conn, user, requestId)) return null;

        if (lineId !== null) {
            const [lines] = await conn.execute(
                `SELECT id FROM quote_request_line WHERE id = ? AND request_id = ?`,
                [lineId, requestId]
            );
            if (!lines.length) return null;
        }

        const [[{ total }]] = await conn.execute(
            `SELECT COUNT(*) AS total FROM quote_request_file WHERE request_id = ?`,
            [requestId]
        );
        if (total + files.length > MAX_REQUEST_FILES) {
            throw new QuoteRequestError(`A request can have at most ${MAX_REQUEST_FILES} files.`, 400);
        }

        const ids = [];
        for (const file of files) {
            const [result] = await conn.execute(
                `INSERT INTO quote_request_file (request_id, line_id, filename, mimetype, size, content, uploaded_at)
                 VALUES (?, ?, ?, ?, ?, ?, NOW())`,
                [requestId, lineId, file.originalname, resolveMimetype(file), file.size, file.buffer]
            );
            ids.push(result.insertId);
        }
        return ids;
    });
}

async function removeRequestFile(db, user, requestId, fileId) {
    return withTransaction(db, async (conn) => {
        if (!await lockDraft(conn, user, requestId)) return null;
        const [result] = await conn.execute(
            `DELETE FROM quote_request_file WHERE id = ? AND request_id = ?`,
            [fileId, requestId]
        );
        return result.affectedRows > 0 ? true : null;
    });
}

module.exports = { REQUEST_EXTENSIONS, MAX_REQUEST_FILES, requestUpload, addRequestFiles, removeRequestFile };
