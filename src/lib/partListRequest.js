const { QuoteRequestError, withTransaction, getRequest, normaliseHeader } = require('./quoteRequests');
const { visibleParts } = require('./sharedPartLists');

const LINE_TEXT_LIMITS = { description: 255, rev: 10, material: 100, finish: 100 };
const STALE_LIST_MESSAGE = 'This list changed. Reload it and try again.';
const placeholders = (items) => items.map(() => '?').join(', ');

async function findList(db, user, listId, suffix = '') {
    const [rows] = await db.execute(
        `SELECT id, name FROM part_list WHERE id = ? AND company_id = ?${suffix}`,
        [listId, user.company_id]
    );
    return rows[0] || null;
}

async function findListParts(db, listId) {
    const [rows] = await db.execute(
        `SELECT p.id AS part_id, p.number AS part_number, p.description
         FROM part_list_item i JOIN part p ON i.part_id = p.id
         WHERE i.list_id = ? ORDER BY p.number, p.id`,
        [listId]
    );
    return rows;
}

async function buildLines(db, user, parts) {
    if (!parts.length) return [];
    const partIds = parts.map((part) => part.part_id);

    const [jobParts] = await db.execute(
        `SELECT jp.part_id, jp.rev, jp.material, jp.finish
         FROM job_part jp JOIN job j ON jp.job_id = j.id
         WHERE j.company_id = ? AND jp.part_id IN (${placeholders(partIds)})
         ORDER BY j.created_at DESC, j.id DESC, jp.id DESC`,
        [user.company_id, ...partIds]
    );
    const [files] = await db.execute(
        `SELECT id, part_id, filename, mimetype FROM uploaded_files
         WHERE part_id IN (${placeholders(partIds)}) AND job_id IS NULL AND note_id IS NULL ORDER BY id`,
        partIds
    );

    return parts.map((part) => {
        const latest = jobParts.find((row) => row.part_id === part.part_id) || {};
        return {
            ...part,
            rev: latest.rev ?? null,
            material: latest.material ?? null,
            finish: latest.finish ?? null,
            drawings: files
                .filter((file) => file.part_id === part.part_id)
                .map(({ id, filename, mimetype }) => ({ id, filename, mimetype })),
        };
    });
}

async function getRequestLines(db, user, listId) {
    if (!(await findList(db, user, listId))) return null;
    return buildLines(db, user, await findListParts(db, listId));
}

async function findMemberList(db, user, listId, suffix = '') {
    const [rows] = await db.execute(
        `SELECT l.id, l.name FROM admin_part_list l
         JOIN admin_part_list_member m ON m.list_id = l.id
         WHERE l.id = ? AND m.company_id = ?${suffix}`,
        [listId, user.company_id]
    );
    return rows[0] || null;
}

// Only parts the company can see, so a hidden part is indistinguishable from an absent one.
async function findVisibleSharedParts(db, user, listId) {
    const [items] = await db.execute(
        `SELECT part_id FROM admin_part_list_item WHERE list_id = ?`,
        [listId]
    );
    const visible = await visibleParts(db, user.company_id, items.map((item) => item.part_id));
    return visible
        .map(({ part_id, part_number, part_description }) => ({ part_id, part_number, description: part_description }))
        .sort((a, b) => (a.part_number < b.part_number ? -1 : a.part_number > b.part_number ? 1 : a.part_id - b.part_id));
}

async function getSharedRequestLines(db, user, listId) {
    if (!(await findMemberList(db, user, listId))) return null;
    return buildLines(db, user, await findVisibleSharedParts(db, user, listId));
}

function cleanText(value, max) {
    if (value === undefined || value === null) return null;
    return String(value).trim().slice(0, max) || null;
}

// Lines without a quantity are skipped; part numbers always come from the database.
function cleanLines(rawLines, partsById) {
    if (!Array.isArray(rawLines)) throw new QuoteRequestError('Lines must be a list.', 400);
    const lines = [];
    for (const raw of rawLines) {
        const part = partsById.get(raw && raw.part_id);
        if (!part) throw new QuoteRequestError(STALE_LIST_MESSAGE, 409);
        if (raw.quantity === undefined || raw.quantity === null || String(raw.quantity).trim() === '') continue;
        const quantity = Number(raw.quantity);
        if (!Number.isInteger(quantity) || quantity < 1) {
            throw new QuoteRequestError('Quantity must be a whole number of at least 1.', 400);
        }
        const line = { part_id: part.part_id, part_number: part.part_number, quantity };
        for (const [key, max] of Object.entries(LINE_TEXT_LIMITS)) line[key] = cleanText(raw[key], max);
        lines.push(line);
    }
    if (!lines.length) throw new QuoteRequestError('Enter a quantity for at least one part.', 400);
    return lines;
}

// loadList(conn) returns { name, parts } or null when the caller has no access to the list.
async function createRequest(db, user, body, loadList) {
    const id = await withTransaction(db, async (conn) => {
        const list = await loadList(conn);
        if (!list) return null;
        const header = normaliseHeader(body || {});
        const name = header.name || list.name;
        const lines = cleanLines(body && body.lines, new Map(list.parts.map((part) => [part.part_id, part])));

        const [result] = await conn.execute(
            `INSERT INTO quote_request (company_id, client_id, client_name, name, need_by, note, status, submitted_at, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, 'sent', NOW(), NOW(), NOW())`,
            [user.company_id, String(user.id), user.name, name, header.needBy, header.note]
        );
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            await conn.execute(
                `INSERT INTO quote_request_line (request_id, position, part_number, description, rev, material, finish, quantity, source_part_id)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [result.insertId, i, line.part_number, line.description, line.rev, line.material, line.finish,
                    line.quantity, line.part_id]
            );
        }
        return result.insertId;
    });
    return id === null ? null : getRequest(db, user, id);
}

function createRequestFromList(db, user, listId, body) {
    return createRequest(db, user, body, async (conn) => {
        const list = await findList(conn, user, listId, ' FOR UPDATE');
        return list && { name: list.name, parts: await findListParts(conn, listId) };
    });
}

function createRequestFromSharedList(db, user, listId, body) {
    return createRequest(db, user, body, async (conn) => {
        const list = await findMemberList(conn, user, listId, ' FOR UPDATE');
        return list && { name: list.name, parts: await findVisibleSharedParts(conn, user, listId) };
    });
}

module.exports = { getRequestLines, createRequestFromList, getSharedRequestLines, createRequestFromSharedList };
