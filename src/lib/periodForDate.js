// Id of the financial period whose start_date..end_date holds the date, or null.
// `date` is YYYY-MM-DD or a Date; `db` may be a pool or a transaction connection.
async function periodIdForDate(db, date) {
    const day = date instanceof Date ? date.toISOString().slice(0, 10) : String(date);
    const [rows] = await db.execute(
        `SELECT id FROM financial_period WHERE start_date <= ? AND end_date >= ? ORDER BY start_date DESC LIMIT 1`,
        [day, day]
    );
    return rows.length > 0 ? rows[0].id : null;
}

module.exports = { periodIdForDate };
