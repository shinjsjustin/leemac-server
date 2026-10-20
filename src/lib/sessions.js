const crypto = require('crypto');
const { signAdminToken, signClientToken } = require('./auth');

const SESSION_ID_BYTES = 32;
const SESSION_SECONDS = {
    admin: 8 * 60 * 60,
    client: 7 * 24 * 60 * 60,
};

/**
 * Insert a session for a user and return its id.
 * @param {object} db
 * @param {'admin'|'client'} userType
 * @param {number} userId
 * @returns {Promise<string>}
 */
async function createSession(db, userType, userId) {
    const sid = crypto.randomBytes(SESSION_ID_BYTES).toString('hex');
    await db.execute(
        'INSERT INTO auth_session (id, user_type, user_id, created_at, expires_at) VALUES (?, ?, ?, NOW(), DATE_ADD(NOW(), INTERVAL ? SECOND))',
        [sid, userType, userId, SESSION_SECONDS[userType]]
    );
    return sid;
}

async function issueAdminSession(db, row) {
    return signAdminToken(row, await createSession(db, 'admin', row.id));
}

async function issueClientSession(db, row) {
    return signClientToken(row, await createSession(db, 'client', row.id));
}

/**
 * @returns {Promise<boolean>} true when the session is unrevoked and unexpired
 */
async function isSessionLive(db, sid, userType, userId) {
    const [rows] = await db.execute(
        'SELECT id FROM auth_session WHERE id = ? AND user_type = ? AND user_id = ? AND revoked_at IS NULL AND expires_at > NOW()',
        [sid, userType, userId]
    );
    return rows.length > 0;
}

async function revokeSession(db, sid) {
    await db.execute('UPDATE auth_session SET revoked_at = NOW() WHERE id = ? AND revoked_at IS NULL', [sid]);
}

/**
 * Revoke all of a user's live sessions, optionally sparing one.
 */
async function revokeAllSessions(db, userType, userId, { exceptSid } = {}) {
    const params = [userType, userId];
    let sql = 'UPDATE auth_session SET revoked_at = NOW() WHERE user_type = ? AND user_id = ? AND revoked_at IS NULL';
    if (exceptSid) {
        sql += ' AND id <> ?';
        params.push(exceptSid);
    }
    await db.execute(sql, params);
}

module.exports = {
    createSession,
    issueAdminSession,
    issueClientSession,
    isSessionLive,
    revokeSession,
    revokeAllSessions,
};
