const { withTransaction } = require('./quoteRequests');

const NAME_MAX = 100;
const MAX_LISTS_PER_COMPANY = 100;
const MAX_PARTS_PER_LIST = 200;

class PartListError extends Error {
    constructor(message, status) {
        super(message);
        this.name = 'PartListError';
        this.status = status;
    }
}

const LIST_COLUMNS = 'id, name, created_by_name, updated_by_name, created_at, updated_at';
const TOUCH = 'updated_by_id = ?, updated_by_name = ?, updated_at = NOW()';
const placeholders = (items) => items.map(() => '?').join(', ');

function cleanName(body) {
    const name = typeof (body && body.name) === 'string' ? body.name.trim() : '';
    if (name.length < 1 || name.length > NAME_MAX) {
        throw new PartListError(`Name must be 1-${NAME_MAX} characters.`, 400);
    }
    return name;
}

function cleanPartIds(body) {
    const ids = body && body.part_ids;
    if (!Array.isArray(ids) || ids.length === 0 || !ids.every((id) => Number.isInteger(id) && id > 0)) {
        throw new PartListError('part_ids must be a non-empty array of positive integers.', 400);
    }
    return [...new Set(ids)];
}

async function attachPartIds(db, companyId, rows) {
    const [items] = await db.execute(
        `SELECT i.list_id, i.part_id FROM part_list_item i
         JOIN part_list l ON i.list_id = l.id
         WHERE l.company_id = ? ORDER BY i.id`,
        [companyId]
    );
    return rows.map((row) => ({
        ...row,
        part_ids: items.filter((item) => item.list_id === row.id).map((item) => item.part_id),
    }));
}

async function listLists(db, user) {
    const [rows] = await db.execute(
        `SELECT ${LIST_COLUMNS} FROM part_list WHERE company_id = ? ORDER BY name, id`,
        [user.company_id]
    );
    return attachPartIds(db, user.company_id, rows);
}

async function getList(db, user, id) {
    const [rows] = await db.execute(
        `SELECT ${LIST_COLUMNS} FROM part_list WHERE id = ? AND company_id = ?`,
        [id, user.company_id]
    );
    if (!rows.length) return null;
    return (await attachPartIds(db, user.company_id, rows))[0];
}

async function lockList(conn, user, id) {
    const [rows] = await conn.execute(
        `SELECT id FROM part_list WHERE id = ? AND company_id = ? FOR UPDATE`,
        [id, user.company_id]
    );
    return rows.length > 0;
}

function touchList(conn, user, id) {
    return conn.execute(
        `UPDATE part_list SET ${TOUCH} WHERE id = ? AND company_id = ?`,
        [String(user.id), user.name, id, user.company_id]
    );
}

async function createList(db, user, body) {
    const name = cleanName(body);
    const id = await withTransaction(db, async (conn) => {
        const [[count]] = await conn.execute(
            `SELECT COUNT(*) AS n FROM part_list WHERE company_id = ? FOR UPDATE`,
            [user.company_id]
        );
        if (count.n >= MAX_LISTS_PER_COMPANY) {
            throw new PartListError(`A company can have at most ${MAX_LISTS_PER_COMPANY} lists.`, 409);
        }
        const [result] = await conn.execute(
            `INSERT INTO part_list (company_id, name, created_by_id, created_by_name, updated_by_id, updated_by_name, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
            [user.company_id, name, String(user.id), user.name, String(user.id), user.name]
        );
        return result.insertId;
    });
    return getList(db, user, id);
}

async function renameList(db, user, id, body) {
    const name = cleanName(body);
    const found = await withTransaction(db, async (conn) => {
        if (!(await lockList(conn, user, id))) return false;
        await conn.execute(
            `UPDATE part_list SET name = ?, ${TOUCH} WHERE id = ? AND company_id = ?`,
            [name, String(user.id), user.name, id, user.company_id]
        );
        return true;
    });
    return found ? getList(db, user, id) : null;
}

async function deleteList(db, user, id) {
    return withTransaction(db, async (conn) => {
        if (!(await lockList(conn, user, id))) return null;
        await conn.execute(`DELETE FROM part_list WHERE id = ? AND company_id = ?`, [id, user.company_id]);
        return true;
    });
}

async function addParts(db, user, id, body) {
    const partIds = cleanPartIds(body);
    const found = await withTransaction(db, async (conn) => {
        if (!(await lockList(conn, user, id))) return false;

        const [owned] = await conn.execute(
            `SELECT DISTINCT jp.part_id FROM job_part jp
             JOIN job j ON jp.job_id = j.id
             WHERE j.company_id = ? AND jp.part_id IN (${placeholders(partIds)})`,
            [user.company_id, ...partIds]
        );
        if (owned.length !== partIds.length) {
            throw new PartListError('Every part must belong to your company.', 400);
        }

        const [existing] = await conn.execute(`SELECT part_id FROM part_list_item WHERE list_id = ?`, [id]);
        const have = new Set(existing.map((row) => row.part_id));
        const fresh = partIds.filter((partId) => !have.has(partId));
        if (have.size + fresh.length > MAX_PARTS_PER_LIST) {
            throw new PartListError(`A list can hold at most ${MAX_PARTS_PER_LIST} parts.`, 409);
        }

        if (fresh.length) {
            await conn.execute(
                `INSERT IGNORE INTO part_list_item (list_id, part_id, added_at)
                 VALUES ${fresh.map(() => '(?, ?, NOW())').join(', ')}`,
                fresh.flatMap((partId) => [id, partId])
            );
        }
        await touchList(conn, user, id);
        return true;
    });
    return found ? getList(db, user, id) : null;
}

async function removeParts(db, user, id, body) {
    const partIds = cleanPartIds(body);
    const found = await withTransaction(db, async (conn) => {
        if (!(await lockList(conn, user, id))) return false;
        await conn.execute(
            `DELETE FROM part_list_item WHERE list_id = ? AND part_id IN (${placeholders(partIds)})`,
            [id, ...partIds]
        );
        await touchList(conn, user, id);
        return true;
    });
    return found ? getList(db, user, id) : null;
}

module.exports = { PartListError, listLists, createList, renameList, deleteList, addParts, removeParts };
