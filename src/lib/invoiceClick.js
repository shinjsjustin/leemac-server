const { nextInvoiceNumber } = require('./invoiceNumbers');

// "Update invoice" click: number a job once, and stamp every click as the ship date.
// Returns null when the job does not exist.
async function recordInvoiceClick(db, jobId, { now = () => new Date() } = {}) {
    const [rows] = await db.execute(`SELECT invoice_number FROM job WHERE id = ?`, [jobId]);
    if (!rows.length) return null;

    const clickedAt = now();
    const today = clickedAt.toISOString().slice(0, 10); // YYYY-MM-DD
    const existing = String(rows[0].invoice_number ?? '').trim();

    if (existing) {
        await db.execute(
            `UPDATE job SET invoice_clicked_at = ?, ship_date = ? WHERE id = ?`,
            [clickedAt, today, jobId]
        );
        return { invoiceNumber: existing, assigned: false };
    }

    const invoiceNumber = await nextInvoiceNumber(db);
    // ship_date = invoice_date: MySQL applies SET assignments left to right, so both are today.
    await db.execute(
        `UPDATE job SET invoice_number = ?, invoice_date = ?, invoice_clicked_at = ?, ship_date = invoice_date WHERE id = ?`,
        [invoiceNumber, today, clickedAt, jobId]
    );
    await db.execute(
        `REPLACE INTO metadata (metakey, metavalue) VALUES ('current_invoice_num', JSON_QUOTE(?))`,
        [invoiceNumber]
    );
    return { invoiceNumber, assigned: true };
}

module.exports = { recordInvoiceClick };
