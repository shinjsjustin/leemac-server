const crypto = require('node:crypto');

const TOKEN_BYTES = 32;

const hash = (token) => crypto.createHash('sha256').update(token).digest('hex');

async function issueToken(db) {
    const token = crypto.randomBytes(TOKEN_BYTES).toString('hex');
    await db.execute('DELETE FROM print_agent');
    await db.execute('INSERT INTO print_agent (token_hash) VALUES (?)', [hash(token)]);
    return token;
}

async function verifyToken(db, token) {
    if (typeof token !== 'string' || !token) return false;
    const [rows] = await db.execute('SELECT id, token_hash FROM print_agent LIMIT 1');
    if (!rows.length) return false;
    const expected = Buffer.from(rows[0].token_hash);
    const actual = Buffer.from(hash(token));
    if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return false;
    await db.execute('UPDATE print_agent SET last_seen_at = NOW() WHERE id = ?', [rows[0].id]);
    return true;
}

async function agentStatus(db) {
    const [rows] = await db.execute('SELECT created_at, last_seen_at FROM print_agent LIMIT 1');
    if (!rows.length) return { configured: false, createdAt: null, lastSeenAt: null };
    return { configured: true, createdAt: rows[0].created_at, lastSeenAt: rows[0].last_seen_at };
}

module.exports = { issueToken, verifyToken, agentStatus };
