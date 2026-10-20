const { lockoutEmail } = require('./authEmails');

const LOCK_AFTER = 5;
const LOCK_MINUTES = 15;
const MS_PER_MINUTE = 60 * 1000;
const TABLES = ['admin', 'clients'];

function assertTable(table) {
    if (!TABLES.includes(table)) throw new Error(`Invalid lockout table: ${table}`);
}

function isLocked(row, now) {
    return Boolean(row.locked_until) && new Date(row.locked_until) > now;
}

async function recordFailure({ db, table, row, now, send }) {
    assertTable(table);
    await db.execute(`UPDATE ${table} SET failed_logins = failed_logins + 1 WHERE id = ?`, [row.id]);
    const [[current]] = await db.execute(`SELECT failed_logins FROM ${table} WHERE id = ?`, [row.id]);
    if (current.failed_logins < LOCK_AFTER) return;
    const lockedUntil = new Date(now.getTime() + LOCK_MINUTES * MS_PER_MINUTE);
    // Only the failure that wins this UPDATE sends the email; concurrent ones affect 0 rows.
    const [lock] = await db.execute(
        `UPDATE ${table} SET failed_logins = 0, locked_until = ? WHERE id = ? AND failed_logins >= ?`,
        [lockedUntil, row.id, LOCK_AFTER],
    );
    if (lock.affectedRows !== 1) return;
    if (!row.email) return;
    try {
        await send({ to: row.email, ...lockoutEmail({ name: row.name, minutes: LOCK_MINUTES }) });
    } catch (err) {
        console.error('Failed to send lockout email', err);
    }
}

async function clearFailures({ db, table, row }) {
    assertTable(table);
    if (!row.failed_logins && !row.locked_until) return;
    await db.execute(`UPDATE ${table} SET failed_logins = 0, locked_until = NULL WHERE id = ?`, [row.id]);
}

module.exports = { LOCK_AFTER, LOCK_MINUTES, isLocked, recordFailure, clearFailures };
