const crypto = require('crypto');

const BACKUP_CODE_COUNT = 10;
const CODE_HALF_LENGTH = 5;
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';
const USER_TYPES = ['admin', 'client'];

function assertUserType(userType) {
    if (!USER_TYPES.includes(userType)) throw new Error(`Invalid backup code user type: ${userType}`);
}

function normalize(code) {
    return String(code).trim().toLowerCase().replace(/[\s-]/g, '');
}

function hashBackupCode(code) {
    return crypto.createHash('sha256').update(normalize(code)).digest('hex');
}

function generateCode() {
    let chars = '';
    for (let i = 0; i < CODE_HALF_LENGTH * 2; i++) chars += ALPHABET[crypto.randomInt(ALPHABET.length)];
    return `${chars.slice(0, CODE_HALF_LENGTH)}-${chars.slice(CODE_HALF_LENGTH)}`;
}

/**
 * Replace a user's backup codes; stores hashes only and returns the plain display codes once.
 * @returns {Promise<string[]>}
 */
async function replaceBackupCodes(db, userType, userId) {
    assertUserType(userType);
    const codes = new Set();
    while (codes.size < BACKUP_CODE_COUNT) codes.add(generateCode());
    await db.execute('DELETE FROM auth_backup_code WHERE user_type = ? AND user_id = ?', [userType, userId]);
    for (const code of codes) {
        await db.execute(
            'INSERT INTO auth_backup_code (user_type, user_id, code_hash) VALUES (?, ?, ?)',
            [userType, userId, hashBackupCode(code)]
        );
    }
    return [...codes];
}

/**
 * Consume a backup code atomically; true only for the one caller whose UPDATE wins.
 */
async function useBackupCode(db, userType, userId, code) {
    assertUserType(userType);
    const [result] = await db.execute(
        'UPDATE auth_backup_code SET used_at = NOW() WHERE user_type = ? AND user_id = ? AND code_hash = ? AND used_at IS NULL',
        [userType, userId, hashBackupCode(code)]
    );
    return result.affectedRows === 1;
}

module.exports = { BACKUP_CODE_COUNT, hashBackupCode, replaceBackupCodes, useBackupCode };
