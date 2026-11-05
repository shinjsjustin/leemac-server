const crypto = require('crypto');
const { withTransaction } = require('./quoteRequests');
const { AdminPartListError } = require('./adminPartLists');
const { visibleParts } = require('./sharedPartLists');

const TOKEN_BYTES = 32;
const HTTP_BAD_REQUEST = 400;

async function getSharing(db, id) {
    const [lists] = await db.execute(`SELECT share_token, share_enabled FROM admin_part_list WHERE id = ?`, [id]);
    if (!lists.length) return null;
    const [members] = await db.execute(
        `SELECT m.company_id, c.name AS company_name, m.joined_at
         FROM admin_part_list_member m
         LEFT JOIN company c ON c.id = m.company_id
         WHERE m.list_id = ? ORDER BY m.id`,
        [id]
    );
    const [items] = await db.execute(`SELECT part_id FROM admin_part_list_item WHERE list_id = ? ORDER BY id`, [id]);
    const partIds = items.map((item) => item.part_id);
    const hiddenFrom = new Map(partIds.map((partId) => [partId, []]));
    for (const member of members) {
        const seen = new Set((await visibleParts(db, member.company_id, partIds)).map((part) => part.part_id));
        for (const partId of partIds) {
            if (!seen.has(partId)) hiddenFrom.get(partId).push(member.company_id);
        }
    }
    const enabled = Boolean(lists[0].share_enabled);
    return {
        enabled,
        token: enabled ? lists[0].share_token : null,
        members: members.map((m) => ({ company_id: m.company_id, company_name: m.company_name, joined_at: m.joined_at })),
        parts: partIds.map((partId) => ({ part_id: partId, hidden_from: hiddenFrom.get(partId) })),
    };
}

async function setSharing(db, user, id, body) {
    const enabled = body && body.enabled;
    if (typeof enabled !== 'boolean') {
        throw new AdminPartListError('enabled must be true or false.', HTTP_BAD_REQUEST);
    }
    const found = await withTransaction(db, async (conn) => {
        const [rows] = await conn.execute(`SELECT share_token FROM admin_part_list WHERE id = ? FOR UPDATE`, [id]);
        if (!rows.length) return false;
        const token = rows[0].share_token || crypto.randomBytes(TOKEN_BYTES).toString('base64url');
        await conn.execute(
            `UPDATE admin_part_list SET share_enabled = ?, share_token = ?, updated_by_id = ?, updated_by_name = ?, updated_at = NOW() WHERE id = ?`,
            [enabled ? 1 : 0, token, String(user.id), user.email, id]
        );
        return true;
    });
    return found ? getSharing(db, id) : null;
}

async function removeMember(db, user, id, companyId) {
    const found = await withTransaction(db, async (conn) => {
        const [rows] = await conn.execute(`SELECT id FROM admin_part_list WHERE id = ? FOR UPDATE`, [id]);
        if (!rows.length) return false;
        await conn.execute(`DELETE FROM admin_part_list_member WHERE list_id = ? AND company_id = ?`, [id, companyId]);
        await conn.execute(
            `UPDATE admin_part_list SET updated_by_id = ?, updated_by_name = ?, updated_at = NOW() WHERE id = ?`,
            [String(user.id), user.email, id]
        );
        return true;
    });
    return found ? getSharing(db, id) : null;
}

module.exports = { getSharing, setSharing, removeMember };
