const { QuoteRequestError, withTransaction } = require('./quoteRequests');
const { normalizePrice } = require('./price');

// Column sizes from migration 012.
const LINE_TEXT_LIMITS = { part_number: 100, description: 255, rev: 10, material: 100, finish: 100 };

const REQUEST_COLUMNS = `id, company_id, client_id, client_name, name, need_by, note, status, job_id,
    created_at, updated_at, submitted_at, reviewed_at`;
const LINE_COLUMNS = `id, request_id, position, part_number, description, rev, material, finish, quantity,
    price, part_id, bourne_suggestion`;
const FILE_COLUMNS = 'id, line_id, filename, mimetype, size';

function cleanText(value, max) {
    if (value === undefined || value === null) return null;
    const text = String(value).trim().slice(0, max);
    return text === '' ? null : text;
}

function cleanQuantity(value) {
    const quantity = Number(value);
    if (value === null || !Number.isInteger(quantity) || quantity < 1) {
        throw new QuoteRequestError('Quantity must be a whole number of at least 1.', 400);
    }
    return quantity;
}

function cleanPrice(value) {
    try {
        return normalizePrice(value);
    } catch {
        throw new QuoteRequestError('Price must be a number of at least 0.', 400);
    }
}

function parseSuggestion(value) {
    return typeof value === 'string' ? JSON.parse(value) : value ?? null;
}

async function listInbox(db, { status } = {}) {
    const params = status ? [status] : [];
    const [rows] = await db.execute(
        `SELECT r.id, r.company_id, c.name AS company_name, r.name, r.need_by, r.status, r.job_id,
                j.job_number, r.submitted_at, r.reviewed_at,
                (SELECT COUNT(*) FROM quote_request_line l WHERE l.request_id = r.id) AS line_count
         FROM quote_request r
         LEFT JOIN company c ON c.id = r.company_id
         LEFT JOIN job j ON j.id = r.job_id
         WHERE r.status <> 'draft'${status ? ' AND r.status = ?' : ''}
         ORDER BY r.submitted_at DESC, r.id DESC`,
        params
    );
    return rows;
}

async function getReview(db, id) {
    const [requests] = await db.execute(`SELECT ${REQUEST_COLUMNS} FROM quote_request WHERE id = ?`, [id]);
    if (!requests.length || requests[0].status === 'draft') return null;

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
            bourne_suggestion: parseSuggestion(line.bourne_suggestion),
            files: files.filter((file) => file.line_id === line.id),
        })),
        files: files.filter((file) => file.line_id === null),
    };
}

async function saveReview(db, id, body) {
    const input = body && body.lines;
    if (!Array.isArray(input)) throw new QuoteRequestError('lines must be an array.', 400);

    const found = await withTransaction(db, async (conn) => {
        const [requests] = await conn.execute(`SELECT id, status FROM quote_request WHERE id = ? FOR UPDATE`, [id]);
        if (!requests.length || requests[0].status === 'draft') return false;
        if (requests[0].status === 'job_created') throw new QuoteRequestError('A job was already created.', 409);

        const [existing] = await conn.execute(`SELECT id FROM quote_request_line WHERE request_id = ?`, [id]);
        const lineIds = new Set(existing.map((row) => row.id));
        const updates = input.map((raw) => {
            const lineId = Number(raw && raw.id);
            if (!lineIds.has(lineId)) throw new QuoteRequestError('Line does not belong to this request.', 400);
            const text = Object.entries(LINE_TEXT_LIMITS).map(([key, max]) => cleanText(raw[key], max));
            return [...text, cleanQuantity(raw.quantity), cleanPrice(raw.price), lineId, id];
        });

        for (const params of updates) {
            await conn.execute(
                `UPDATE quote_request_line SET part_number = ?, description = ?, rev = ?, material = ?, finish = ?,
                 quantity = ?, price = ? WHERE id = ? AND request_id = ?`,
                params
            );
        }
        await conn.execute(
            `UPDATE quote_request SET status = 'in_review', updated_at = NOW() WHERE id = ?`,
            [id]
        );
        return true;
    });
    return found ? getReview(db, id) : null;
}

async function saveSuggestion(db, requestId, lineId, body) {
    const input = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
    const keys = Object.keys(input);
    if (!keys.length || keys.some((key) => !(key in LINE_TEXT_LIMITS))) {
        throw new QuoteRequestError('Only part_number, rev, material, finish and description may be suggested.', 400);
    }
    const suggestion = {};
    for (const key of keys) {
        if (typeof input[key] !== 'string') throw new QuoteRequestError(`${key} must be a string.`, 400);
        suggestion[key] = input[key].trim().slice(0, LINE_TEXT_LIMITS[key]);
    }

    return withTransaction(db, async (conn) => {
        const [requests] = await conn.execute(
            `SELECT id, status FROM quote_request WHERE id = ? FOR UPDATE`,
            [requestId]
        );
        if (!requests.length || requests[0].status === 'draft') return null;
        if (requests[0].status === 'job_created') throw new QuoteRequestError('A job was already created.', 409);

        const [lines] = await conn.execute(
            `SELECT id FROM quote_request_line WHERE id = ? AND request_id = ?`,
            [lineId, requestId]
        );
        if (!lines.length) return null;

        await conn.execute(
            `UPDATE quote_request_line SET bourne_suggestion = ? WHERE id = ? AND request_id = ?`,
            [JSON.stringify(suggestion), lineId, requestId]
        );
        return { line_id: lineId, bourne_suggestion: suggestion };
    });
}

async function checkMatches(db, id) {
    const review = await getReview(db, id);
    if (!review) return null;

    const lines = review.lines.filter((line) => line.part_number && line.part_number.trim());
    if (!lines.length) return [];

    const keyOf = (number) => number.trim().toLowerCase();
    const keys = [...new Set(lines.map((line) => keyOf(line.part_number)))];
    const [rows] = await db.execute(
        `SELECT p.id AS part_id, p.number, p.description, j.id AS job_id, j.job_number
         FROM part p
         LEFT JOIN job_part jp ON jp.part_id = p.id
         LEFT JOIN job j ON j.id = jp.job_id
         WHERE LOWER(TRIM(p.number)) IN (${keys.map(() => '?').join(', ')})
         ORDER BY p.id, j.id`,
        keys
    );

    const partsByKey = new Map();
    for (const row of rows) {
        const key = keyOf(row.number);
        const parts = partsByKey.get(key) || new Map();
        const part = parts.get(row.part_id) || { part_id: row.part_id, number: row.number, description: row.description, jobs: [] };
        if (row.job_id !== null && !part.jobs.some((job) => job.id === row.job_id)) {
            part.jobs.push({ id: row.job_id, job_number: row.job_number });
        }
        parts.set(row.part_id, part);
        partsByKey.set(key, parts);
    }

    return lines.map((line) => ({
        line_id: line.id,
        part_number: line.part_number,
        matches: [...(partsByKey.get(keyOf(line.part_number))?.values() || [])],
    }));
}

async function getRequestFile(db, id, fileId) {
    const [rows] = await db.execute(
        `SELECT f.filename, f.mimetype, f.content
         FROM quote_request_file f
         JOIN quote_request r ON r.id = f.request_id
         WHERE f.request_id = ? AND f.id = ? AND r.status <> 'draft'`,
        [id, fileId]
    );
    return rows.length ? rows[0] : null;
}

module.exports = { listInbox, getReview, saveReview, saveSuggestion, checkMatches, getRequestFile };
