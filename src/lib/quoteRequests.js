const MAX_NAME = 100;
const MAX_NOTE = 2000;
const MAX_LINES = 200;
const NEED_BY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// Only these body keys reach the database; price, part_id and bourne_suggestion are staff-owned.
const LINE_TEXT_LIMITS = { part_number: 100, description: 255, rev: 10, material: 100, finish: 100 };

const REQUEST_COLUMNS = `id, company_id, client_id, client_name, name, need_by, note, status, job_id,
    created_at, updated_at, submitted_at, reviewed_at`;
const LINE_COLUMNS = 'id, request_id, position, part_number, description, rev, material, finish, quantity';
const FILE_COLUMNS = 'id, line_id, filename, mimetype, size';

class QuoteRequestError extends Error {
    constructor(message, status) {
        super(message);
        this.name = 'QuoteRequestError';
        this.status = status;
    }
}

function cleanText(value, max) {
    if (value === undefined || value === null) return null;
    const text = String(value).trim().slice(0, max);
    return text === '' ? null : text;
}

function cleanQuantity(value) {
    if (value === undefined || value === null || value === '') return null;
    const quantity = Number(value);
    if (!Number.isInteger(quantity) || quantity < 1) {
        throw new QuoteRequestError('Quantity must be a whole number of at least 1.', 400);
    }
    return quantity;
}

function normaliseLines(lines) {
    if (lines === undefined || lines === null) return [];
    if (!Array.isArray(lines) || lines.length > MAX_LINES) {
        throw new QuoteRequestError(`A request can have at most ${MAX_LINES} lines.`, 400);
    }
    const out = [];
    for (const raw of lines) {
        const line = { id: Number.isInteger(raw && raw.id) ? raw.id : null };
        for (const [key, max] of Object.entries(LINE_TEXT_LIMITS)) line[key] = cleanText(raw && raw[key], max);
        line.quantity = cleanQuantity(raw && raw.quantity);
        const isEmpty = line.quantity === null && Object.keys(LINE_TEXT_LIMITS).every((key) => line[key] === null);
        if (!isEmpty) out.push(line);
    }
    return out;
}

function normaliseHeader(body) {
    const name = cleanText(body.name, Number.MAX_SAFE_INTEGER);
    if (name && name.length > MAX_NAME) throw new QuoteRequestError(`Name must be at most ${MAX_NAME} characters.`, 400);
    const note = cleanText(body.note, MAX_NOTE);
    const needBy = cleanText(body.need_by, 10);
    if (needBy && (!NEED_BY_PATTERN.test(needBy) || Number.isNaN(Date.parse(needBy)))) {
        throw new QuoteRequestError('Need-by date must be YYYY-MM-DD.', 400);
    }
    return { name, note, needBy };
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

function insertLine(conn, requestId, position, line) {
    return conn.execute(
        `INSERT INTO quote_request_line (request_id, position, part_number, description, rev, material, finish, quantity)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [requestId, position, line.part_number, line.description, line.rev, line.material, line.finish, line.quantity]
    );
}

async function createDraft(db, user, body) {
    const { name, note, needBy } = normaliseHeader(body || {});
    const lines = normaliseLines(body && body.lines);
    const id = await withTransaction(db, async (conn) => {
        const [result] = await conn.execute(
            `INSERT INTO quote_request (company_id, client_id, client_name, name, need_by, note, status, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, 'draft', NOW(), NOW())`,
            [user.company_id, String(user.id), user.name, name, needBy, note]
        );
        for (let i = 0; i < lines.length; i++) await insertLine(conn, result.insertId, i, lines[i]);
        return result.insertId;
    });
    return getRequest(db, user, id);
}

async function updateDraft(db, user, id, body) {
    const { name, note, needBy } = normaliseHeader(body || {});
    const lines = normaliseLines(body && body.lines);
    const found = await withTransaction(db, async (conn) => {
        const [rows] = await conn.execute(
            `SELECT id, status FROM quote_request WHERE id = ? AND company_id = ? FOR UPDATE`,
            [id, user.company_id]
        );
        if (!rows.length) return false;
        if (rows[0].status !== 'draft') throw new QuoteRequestError('Only a draft can be edited.', 409);

        await conn.execute(
            `UPDATE quote_request SET name = ?, need_by = ?, note = ?, updated_at = NOW() WHERE id = ? AND company_id = ?`,
            [name, needBy, note, id, user.company_id]
        );

        const [existing] = await conn.execute(`SELECT id FROM quote_request_line WHERE request_id = ?`, [id]);
        const existingIds = new Set(existing.map((row) => row.id));
        const keptIds = new Set(lines.filter((line) => existingIds.has(line.id)).map((line) => line.id));
        const removedIds = [...existingIds].filter((lineId) => !keptIds.has(lineId));
        if (removedIds.length) {
            await conn.execute(
                `DELETE FROM quote_request_line WHERE request_id = ? AND id IN (${removedIds.map(() => '?').join(', ')})`,
                [id, ...removedIds]
            );
        }

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (!keptIds.has(line.id)) {
                await insertLine(conn, id, i, line);
                continue;
            }
            await conn.execute(
                `UPDATE quote_request_line SET position = ?, part_number = ?, description = ?, rev = ?, material = ?,
                 finish = ?, quantity = ? WHERE id = ? AND request_id = ?`,
                [i, line.part_number, line.description, line.rev, line.material, line.finish, line.quantity, line.id, id]
            );
        }
        return true;
    });
    return found ? getRequest(db, user, id) : null;
}

async function listRequests(db, user) {
    const [rows] = await db.execute(
        `SELECT ${REQUEST_COLUMNS} FROM quote_request WHERE company_id = ? ORDER BY updated_at DESC, id DESC`,
        [user.company_id]
    );
    return rows;
}

function toFile({ id, filename, mimetype, size }) {
    return { id, filename, mimetype, size };
}

async function getRequest(db, user, id) {
    const [requests] = await db.execute(
        `SELECT ${REQUEST_COLUMNS} FROM quote_request WHERE id = ? AND company_id = ?`,
        [id, user.company_id]
    );
    if (!requests.length) return null;

    const [lines] = await db.execute(
        `SELECT ${LINE_COLUMNS} FROM quote_request_line WHERE request_id = ? ORDER BY position, id`,
        [id]
    );
    const [files] = await db.execute(
        `SELECT ${FILE_COLUMNS} FROM quote_request_file WHERE request_id = ? ORDER BY id`,
        [id]
    );
    return {
        ...requests[0],
        lines: lines.map((line) => ({
            ...line,
            files: files.filter((file) => file.line_id === line.id).map(toFile),
        })),
        files: files.filter((file) => file.line_id === null).map(toFile),
    };
}

async function submitRequest(db, user, id) {
    const request = await getRequest(db, user, id);
    if (!request) return null;
    if (request.status !== 'draft') throw new QuoteRequestError('Only a draft can be submitted.', 409);

    const isLineComplete = (line) => line.quantity >= 1 && Boolean(line.part_number || line.description);
    if (!request.lines.length || !request.lines.every(isLineComplete)) {
        throw new QuoteRequestError('Every line needs a quantity and a part number or description.', 400);
    }

    const [result] = await db.execute(
        `UPDATE quote_request SET status = 'sent', submitted_at = NOW(), updated_at = NOW()
         WHERE id = ? AND company_id = ? AND status = 'draft'`,
        [id, user.company_id]
    );
    if (result && result.affectedRows === 0) throw new QuoteRequestError('Only a draft can be submitted.', 409);
    return getRequest(db, user, id);
}

module.exports = {
    QuoteRequestError, normaliseLines, createDraft, updateDraft, listRequests, getRequest, submitRequest,
};
