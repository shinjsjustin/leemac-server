const { hashPassword } = require('./auth');
const { createAuthToken, consumeAuthToken } = require('./authTokens');
const { resetEmail, appLink } = require('./authEmails');
const { revokeAllSessions } = require('./sessions');

const TABLES = { admin: 'admin', client: 'clients' };

function tableFor(userType) {
    const table = TABLES[userType];
    if (!table) throw new Error(`Invalid user type: ${userType}`);
    return table;
}

async function requestReset({ db, userType, email, send }) {
    const table = tableFor(userType);
    const address = String(email || '').trim().toLowerCase();
    const [[user]] = await db.execute(`SELECT * FROM ${table} WHERE email = ?`, [address]);
    if (!user || user.disabled) return;
    const raw = await createAuthToken(db, { purpose: 'reset', userType, userId: user.id, email: address, name: user.name });
    const link = appLink(`/reset-password?type=${userType}&token=${raw}`);
    try {
        await send({ to: address, ...resetEmail({ name: user.name, link }) });
    } catch (err) {
        console.error('Failed to send reset email', err);
    }
}

async function completeReset({ db, userType, token, newPassword }) {
    const table = tableFor(userType);
    const row = await consumeAuthToken(db, { purpose: 'reset', userType, token });
    if (!row) return false;
    await db.execute(
        `UPDATE ${table} SET password = ?, failed_logins = 0, locked_until = NULL, email_verified_at = COALESCE(email_verified_at, NOW()) WHERE id = ?`,
        [await hashPassword(newPassword), row.user_id],
    );
    await revokeAllSessions(db, userType, row.user_id);
    return true;
}

module.exports = { requestReset, completeReset };
