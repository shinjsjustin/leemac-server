const crypto = require('crypto');
const { hashToken } = require('./authTokens');

const TRUST_DAYS = 30;
const TOKEN_BYTES = 32;

// Order matters: Edge and Chrome UAs also contain "Chrome"/"Safari"; iOS and Android UAs contain "Mac OS X"/"Linux".
const BROWSERS = [['Edge', /Edg\//], ['Chrome', /Chrome\/|CriOS\//], ['Firefox', /Firefox\/|FxiOS\//], ['Safari', /Safari\//]];
const SYSTEMS = [['Windows', /Windows/], ['iOS', /iPhone|iPad|iPod/], ['Android', /Android/], ['macOS', /Macintosh|Mac OS X/], ['Linux', /Linux|X11/]];

function browserLabel(ua) {
    const text = typeof ua === 'string' ? ua : '';
    const browser = BROWSERS.find(([, re]) => re.test(text));
    const system = SYSTEMS.find(([, re]) => re.test(text));
    if (!browser || !system) return 'Unknown browser';
    return `${browser[0]} on ${system[0]}`;
}

function deleteExpired(db, adminId) {
    return db.execute('DELETE FROM admin_trusted_device WHERE admin_id = ? AND expires_at <= NOW()', [adminId]);
}

/** Remember this browser for TRUST_DAYS days; returns the raw token for the cookie. */
async function trustDevice(db, adminId, userAgent) {
    await deleteExpired(db, adminId);
    const raw = crypto.randomBytes(TOKEN_BYTES).toString('hex');
    await db.execute(
        'INSERT INTO admin_trusted_device (admin_id, token_hash, label, created_at, last_used_at, expires_at) VALUES (?, ?, ?, NOW(), NOW(), DATE_ADD(NOW(), INTERVAL ? DAY))',
        [adminId, hashToken(raw), browserLabel(userAgent), TRUST_DAYS]
    );
    return raw;
}

/** True when the token is a live trusted device for this admin; renews its expiry. */
async function useTrustedDevice(db, adminId, raw) {
    if (!raw || typeof raw !== 'string') return false;
    const [result] = await db.execute(
        'UPDATE admin_trusted_device SET last_used_at = NOW(), expires_at = DATE_ADD(NOW(), INTERVAL ? DAY) WHERE admin_id = ? AND token_hash = ? AND expires_at > NOW()',
        [TRUST_DAYS, adminId, hashToken(raw)]
    );
    return result.affectedRows === 1;
}

async function listTrustedDevices(db, adminId) {
    await deleteExpired(db, adminId);
    const [rows] = await db.execute(
        'SELECT id, label, created_at, last_used_at, expires_at FROM admin_trusted_device WHERE admin_id = ? ORDER BY last_used_at DESC',
        [adminId]
    );
    return rows;
}

async function revokeTrustedDevice(db, adminId, id) {
    const [result] = await db.execute('DELETE FROM admin_trusted_device WHERE id = ? AND admin_id = ?', [id, adminId]);
    return result.affectedRows > 0;
}

async function revokeAllTrustedDevices(db, adminId) {
    await db.execute('DELETE FROM admin_trusted_device WHERE admin_id = ?', [adminId]);
}

module.exports = { TRUST_DAYS, browserLabel, trustDevice, useTrustedDevice, listTrustedDevices, revokeTrustedDevice, revokeAllTrustedDevices };
