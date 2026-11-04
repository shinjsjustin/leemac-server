const { withTransaction } = require('./quoteRequests');
const { isChargeLine } = require('./chargeLines');

const NAME_MAX = 100;
const MAX_PARTS_PER_LIST = 500;

class SharedPartListError extends Error {
    constructor(message, status) {
        super(message);
        this.name = 'SharedPartListError';
        this.status = status;
    }
}

const placeholders = (items) => items.map(() => '?').join(', ');
const editor = (user) => [`client:${user.id}`, user.name];

function cleanName(body) {
    const name = typeof (body && body.name) === 'string' ? body.name.trim() : '';
    if (name.length < 1 || name.length > NAME_MAX) {
        throw new SharedPartListError(`Name must be 1-${NAME_MAX} characters.`, 400);
    }
    return name;
}

function cleanPartIds(body) {
    const ids = body && body.part_ids;
    if (!Array.isArray(ids) || ids.length === 0 || !ids.every((id) => Number.isInteger(id) && id > 0)) {
        throw new SharedPartListError('part_ids must be a non-empty array of positive integers.', 400);
    }
    return [...new Set(ids)];
}

// A part is visible when the company has a job line for it that is not a fee/setup line.
async function visibleParts(db, companyId, partIds) {
    if (!partIds.length) return [];
    const [rows] = await db.execute(
        `SELECT p.id AS part_id, p.number AS part_number, p.description AS part_description, jp.details
         FROM job_part jp
         JOIN job j ON jp.job_id = j.id
         JOIN part p ON jp.part_id = p.id
         WHERE j.company_id = ? AND p.id IN (${placeholders(partIds)})
         ORDER BY p.id, jp.id`,
        [companyId, ...partIds]
    );
    const seen = new Set();
    const parts = [];
    for (const row of rows) {
        if (seen.has(row.part_id) || isChargeLine(row)) continue;
        seen.add(row.part_id);
        parts.push({ part_id: row.part_id, part_number: row.part_number, part_description: row.part_description });
    }
    return parts;
}

async function partFiles(db, partIds) {
    if (!partIds.length) return [];
    const [rows] = await db.execute(
        `SELECT id, part_id, filename, mimetype, size FROM uploaded_files
         WHERE part_id IN (${placeholders(partIds)}) AND job_id IS NULL AND note_id IS NULL
         ORDER BY id`,
        partIds
    );
    return rows;
}

// Every reply is built field by field so no stored column can leak.
async function buildList(db, user, row) {
    const [items] = await db.execute(
        `SELECT part_id, added_by_company_id FROM admin_part_list_item WHERE list_id = ? ORDER BY id`,
        [row.id]
    );
    const visible = await visibleParts(db, user.company_id, items.map((item) => item.part_id));
    const files = await partFiles(db, visible.map((part) => part.part_id));
    const adder = new Map(items.map((item) => [item.part_id, item.added_by_company_id]));
    const order = new Map(items.map((item, index) => [item.part_id, index]));
    const parts = visible
        .sort((a, b) => order.get(a.part_id) - order.get(b.part_id))
        .map((part) => ({
            part_id: part.part_id,
            part_number: part.part_number,
            part_description: part.part_description,
            can_remove: adder.get(part.part_id) === user.company_id,
            files: files
                .filter((file) => file.part_id === part.part_id)
                .map((file) => ({
                    id: file.id,
                    filename: file.filename,
                    mimetype: file.mimetype,
                    size: file.size,
                    url: `/api/portal/files/${file.id}`,
                })),
        }));
    return { id: row.id, name: row.name, parts };
}

async function memberList(db, user, id) {
    const [rows] = await db.execute(
        `SELECT l.id, l.name FROM admin_part_list l
         JOIN admin_part_list_member m ON m.list_id = l.id
         WHERE l.id = ? AND m.company_id = ?`,
        [id, user.company_id]
    );
    return rows[0] || null;
}

async function inviteRow(db, token) {
    if (typeof token !== 'string' || !token) return null;
    const [rows] = await db.execute(
        `SELECT id, name FROM admin_part_list WHERE share_token = ? AND share_enabled = 1`,
        [token]
    );
    return rows[0] || null;
}

async function isMember(db, user, id) {
    return (await memberList(db, user, id)) !== null;
}

async function getInvite(db, user, token) {
    const row = await inviteRow(db, token);
    if (!row) return null;
    return { ...(await buildList(db, user, row)), joined: await isMember(db, user, row.id) };
}

async function joinList(db, user, token) {
    const row = await inviteRow(db, token);
    if (!row) return null;
    await db.execute(
        `INSERT IGNORE INTO admin_part_list_member (list_id, company_id, joined_by_id, joined_by_name, joined_at)
         VALUES (?, ?, ?, ?, NOW())`,
        [row.id, user.company_id, String(user.id), user.name]
    );
    return getInvite(db, user, token);
}

async function listSharedLists(db, user) {
    const [rows] = await db.execute(
        `SELECT l.id, l.name FROM admin_part_list l
         JOIN admin_part_list_member m ON m.list_id = l.id
         WHERE m.company_id = ? ORDER BY l.name, l.id`,
        [user.company_id]
    );
    return Promise.all(rows.map((row) => buildList(db, user, row)));
}

async function getSharedList(db, user, id) {
    const row = await memberList(db, user, id);
    return row ? buildList(db, user, row) : null;
}

async function lockMember(conn, user, id) {
    const [rows] = await conn.execute(
        `SELECT l.id FROM admin_part_list l
         JOIN admin_part_list_member m ON m.list_id = l.id
         WHERE l.id = ? AND m.company_id = ? FOR UPDATE`,
        [id, user.company_id]
    );
    return rows.length > 0;
}

function touchList(conn, user, id) {
    return conn.execute(
        `UPDATE admin_part_list SET updated_by_id = ?, updated_by_name = ?, updated_at = NOW() WHERE id = ?`,
        [...editor(user), id]
    );
}

async function renameList(db, user, id, body) {
    const name = cleanName(body);
    const found = await withTransaction(db, async (conn) => {
        if (!(await lockMember(conn, user, id))) return false;
        await conn.execute(
            `UPDATE admin_part_list SET name = ?, updated_by_id = ?, updated_by_name = ?, updated_at = NOW() WHERE id = ?`,
            [name, ...editor(user), id]
        );
        return true;
    });
    return found ? getSharedList(db, user, id) : null;
}

async function addParts(db, user, id, body) {
    const partIds = cleanPartIds(body);
    const found = await withTransaction(db, async (conn) => {
        if (!(await lockMember(conn, user, id))) return false;

        const visible = await visibleParts(conn, user.company_id, partIds);
        if (visible.length !== partIds.length) {
            throw new SharedPartListError('Every part must be one of your parts.', 400);
        }

        const [existing] = await conn.execute(`SELECT part_id FROM admin_part_list_item WHERE list_id = ?`, [id]);
        const have = new Set(existing.map((row) => row.part_id));
        const fresh = partIds.filter((partId) => !have.has(partId));
        if (have.size + fresh.length > MAX_PARTS_PER_LIST) {
            throw new SharedPartListError("This list can't take that many more parts.", 409);
        }

        if (fresh.length) {
            await conn.execute(
                `INSERT IGNORE INTO admin_part_list_item (list_id, part_id, added_at, added_by_company_id)
                 VALUES ${fresh.map(() => '(?, ?, NOW(), ?)').join(', ')}`,
                fresh.flatMap((partId) => [id, partId, user.company_id])
            );
        }
        await touchList(conn, user, id);
        return true;
    });
    return found ? getSharedList(db, user, id) : null;
}

async function removeParts(db, user, id, body) {
    const partIds = cleanPartIds(body);
    const found = await withTransaction(db, async (conn) => {
        if (!(await lockMember(conn, user, id))) return false;
        await conn.execute(
            `DELETE FROM admin_part_list_item
             WHERE list_id = ? AND added_by_company_id = ? AND part_id IN (${placeholders(partIds)})`,
            [id, user.company_id, ...partIds]
        );
        await touchList(conn, user, id);
        return true;
    });
    return found ? getSharedList(db, user, id) : null;
}

async function leaveList(db, user, id) {
    return withTransaction(db, async (conn) => {
        if (!(await lockMember(conn, user, id))) return null;
        await conn.execute(`DELETE FROM admin_part_list_member WHERE list_id = ? AND company_id = ?`, [id, user.company_id]);
        return true;
    });
}

module.exports = {
    SharedPartListError,
    visibleParts,
    getInvite,
    joinList,
    listSharedLists,
    getSharedList,
    renameList,
    addParts,
    removeParts,
    leaveList,
};
