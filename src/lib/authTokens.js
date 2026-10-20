const crypto = require('crypto');

const TOKEN_HOURS = 24;
const TOKEN_BYTES = 32;
const PURPOSES = ['invite', 'reset', 'verify_email'];

function hashToken(raw) {
    return crypto.createHash('sha256').update(raw).digest('hex');
}

/**
 * Store a single-use link token (hash only) and return the raw token for the email.
 * @returns {Promise<string>}
 */
async function createAuthToken(db, { purpose, userType, userId, email, name, companyId, createdBy }) {
    const raw = crypto.randomBytes(TOKEN_BYTES).toString('hex');
    await db.execute(
        'INSERT INTO auth_token (purpose, user_type, user_id, email, name, company_id, token_hash, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), DATE_ADD(NOW(), INTERVAL ? HOUR))',
        [purpose, userType, userId ?? null, email, name ?? null, companyId ?? null, hashToken(raw), createdBy ?? null, TOKEN_HOURS]
    );
    return raw;
}

/**
 * Look up a valid, unused, unexpired token without consuming it; returns its row or null.
 */
async function findAuthToken(db, { purpose, userType, token }) {
    if (!PURPOSES.includes(purpose)) throw new Error(`Invalid auth token purpose: ${purpose}`);
    const [rows] = await db.execute(
        'SELECT * FROM auth_token WHERE token_hash = ? AND purpose = ? AND user_type = ? AND used_at IS NULL AND expires_at > NOW()',
        [hashToken(token), purpose, userType]
    );
    return rows[0] ?? null;
}

/**
 * Atomically mark a token used; returns its row, or null if invalid, used or expired.
 */
async function consumeAuthToken(db, { purpose, userType, token }) {
    if (!PURPOSES.includes(purpose)) throw new Error(`Invalid auth token purpose: ${purpose}`);
    const hash = hashToken(token);
    const [result] = await db.execute(
        'UPDATE auth_token SET used_at = NOW() WHERE token_hash = ? AND purpose = ? AND user_type = ? AND used_at IS NULL AND expires_at > NOW()',
        [hash, purpose, userType]
    );
    if (result.affectedRows !== 1) return null;
    const [[row]] = await db.execute('SELECT * FROM auth_token WHERE token_hash = ?', [hash]);
    return row;
}

module.exports = { TOKEN_HOURS, hashToken, createAuthToken, findAuthToken, consumeAuthToken };
