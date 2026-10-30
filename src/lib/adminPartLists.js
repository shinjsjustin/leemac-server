const { withTransaction } = require('./quoteRequests');

const NAME_MAX = 100;
const MAX_LISTS = 100;
const MAX_PARTS_PER_LIST = 500;

class AdminPartListError extends Error {
    constructor(message, status) {
        super(message);
        this.name = 'AdminPartListError';
        this.status = status;
    }
}

const LIST_COLUMNS = 'id, name, created_by_name, updated_by_name, created_at, updated_at';
const TOUCH = 'updated_by_id = ?, updated_by_name = ?, updated_at = NOW()';
const placeholders = (items) => items.map(() => '?').join(', ');

function cleanName(body) {
    const name = typeof (body && body.name) === 'string' ? body.name.trim() : '';
    if (name.length < 1 || name.length > NAME_MAX) {
        throw new AdminPartListError(`Name must be 1-${NAME_MAX} characters.`, 400);
    }
    return name;
}

function cleanPartIds(body) {
    const ids = body && body.part_ids;
    if (!Array.isArray(ids) || ids.length === 0 || !ids.every((id) => Number.isInteger(id) && id > 0)) {
        throw new AdminPartListError('part_ids must be a non-empty array of positive integers.', 400);
    }
    return [...new Set(ids)];
}

async function attachPartIds(db, rows) {
    if (!rows.length) return [];
    const ids = rows.map((row) => row.id);
    const [items] = await db.execute(
        `SELECT i.list_id, i.part_id FROM admin_part_list_item i WHERE i.list_id IN (${ids.map(() => '?').join(', ')}) ORDER BY i.id`,
        ids
    );
    return rows.map((row) => ({
        ...row,
        part_ids: items.filter((item) => item.list_id === row.id).map((item) => item.part_id),
    }));
}

async function listLists(db) {
    const [rows] = await db.execute(`SELECT ${LIST_COLUMNS} FROM admin_part_list ORDER BY name, id`);
    return attachPartIds(db, rows);
}

async function getList(db, id) {
    const [rows] = await db.execute(`SELECT ${LIST_COLUMNS} FROM admin_part_list WHERE id = ?`, [id]);
    if (!rows.length) return null;
    return (await attachPartIds(db, rows))[0];
}

async function lockList(conn, id) {
    const [rows] = await conn.execute(`SELECT id FROM admin_part_list WHERE id = ? FOR UPDATE`, [id]);
    return rows.length > 0;
}

function touchList(conn, user, id) {
    return conn.execute(
        `UPDATE admin_part_list SET ${TOUCH} WHERE id = ?`,
        [String(user.id), user.email, id]
    );
}

async function createList(db, user, body) {
    const name = cleanName(body);
    const id = await withTransaction(db, async (conn) => {
        const [[count]] = await conn.execute(`SELECT COUNT(*) AS n FROM admin_part_list FOR UPDATE`);
        if (count.n >= MAX_LISTS) {
            throw new AdminPartListError(`There can be at most ${MAX_LISTS} admin lists.`, 409);
        }
        const [result] = await conn.execute(
            `INSERT INTO admin_part_list (name, created_by_id, created_by_name, updated_by_id, updated_by_name, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
            [name, String(user.id), user.email, String(user.id), user.email]
        );
        return result.insertId;
    });
    return getList(db, id);
}

async function renameList(db, user, id, body) {
    const name = cleanName(body);
    const found = await withTransaction(db, async (conn) => {
        if (!(await lockList(conn, id))) return false;
        await conn.execute(
            `UPDATE admin_part_list SET name = ?, ${TOUCH} WHERE id = ?`,
            [name, String(user.id), user.email, id]
        );
        return true;
    });
    return found ? getList(db, id) : null;
}

async function deleteList(db, user, id) {
    return withTransaction(db, async (conn) => {
        if (!(await lockList(conn, id))) return null;
        await conn.execute(`DELETE FROM admin_part_list WHERE id = ?`, [id]);
        return true;
    });
}

async function addParts(db, user, id, body) {
    const partIds = cleanPartIds(body);
    const found = await withTransaction(db, async (conn) => {
        if (!(await lockList(conn, id))) return false;

        const [known] = await conn.execute(
            `SELECT id FROM part WHERE id IN (${placeholders(partIds)})`,
            partIds
        );
        if (known.length !== partIds.length) {
            throw new AdminPartListError('Every part must exist.', 400);
        }

        const [existing] = await conn.execute(`SELECT part_id FROM admin_part_list_item WHERE list_id = ?`, [id]);
        const have = new Set(existing.map((row) => row.part_id));
        const fresh = partIds.filter((partId) => !have.has(partId));
        if (have.size + fresh.length > MAX_PARTS_PER_LIST) {
            throw new AdminPartListError(`A list can hold at most ${MAX_PARTS_PER_LIST} parts.`, 409);
        }

        if (fresh.length) {
            await conn.execute(
                `INSERT IGNORE INTO admin_part_list_item (list_id, part_id, added_at)
                 VALUES ${fresh.map(() => '(?, ?, NOW())').join(', ')}`,
                fresh.flatMap((partId) => [id, partId])
            );
        }
        await touchList(conn, user, id);
        return true;
    });
    return found ? getList(db, id) : null;
}

async function removeParts(db, user, id, body) {
    const partIds = cleanPartIds(body);
    const found = await withTransaction(db, async (conn) => {
        if (!(await lockList(conn, id))) return false;
        await conn.execute(
            `DELETE FROM admin_part_list_item WHERE list_id = ? AND part_id IN (${placeholders(partIds)})`,
            [id, ...partIds]
        );
        await touchList(conn, user, id);
        return true;
    });
    return found ? getList(db, id) : null;
}

module.exports = { AdminPartListError, listLists, createList, renameList, deleteList, addParts, removeParts };
