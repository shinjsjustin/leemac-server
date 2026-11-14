const BAD_REQUEST = 400;
const NOT_FOUND = 404;

class InvoicePaidError extends Error {
    constructor(message, status) {
        super(message);
        this.name = 'InvoicePaidError';
        this.status = status;
    }
}

// Paying the invoice ends the job's stay on the Overview, so its stars go.
async function markInvoicePaid(db, jobId, { today = new Date().toISOString().slice(0, 10) } = {}) {
    const [rows] = await db.execute(
        `SELECT id, invoice_status, invoice_number FROM job WHERE id = ?`,
        [jobId]
    );
    if (rows.length === 0) throw new InvoicePaidError('Job not found', NOT_FOUND);
    if (!rows[0].invoice_number) throw new InvoicePaidError('Job does not have an invoice number', BAD_REQUEST);
    if (rows[0].invoice_status === 'paid') throw new InvoicePaidError('Invoice is already marked as paid', BAD_REQUEST);

    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        await conn.execute(`UPDATE job SET invoice_status = 'paid', paid_date = ? WHERE id = ?`, [today, jobId]);
        const [result] = await conn.execute(
            `DELETE FROM stars WHERE job_part_id IN (SELECT id FROM job_part WHERE job_id = ?)`,
            [jobId]
        );
        await conn.commit();
        return { unstarred: result.affectedRows };
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
}

// Round-trips through Date so impossible days like 2026-02-30 are rejected.
function isRealDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

// paidDate is a real YYYY-MM-DD, or null to clear it.
async function setPaidDate(db, jobId, paidDate) {
    if (paidDate !== null && !isRealDate(paidDate)) throw new InvoicePaidError('paid_date must be YYYY-MM-DD or null', BAD_REQUEST);
    const [rows] = await db.execute(`SELECT invoice_status FROM job WHERE id = ?`, [jobId]);
    if (rows.length === 0) throw new InvoicePaidError('Job not found', NOT_FOUND);
    if (rows[0].invoice_status !== 'paid') throw new InvoicePaidError('Invoice is not marked as paid', BAD_REQUEST);
    await db.execute(`UPDATE job SET paid_date = ? WHERE id = ?`, [paidDate, jobId]);
}

module.exports = { markInvoicePaid, setPaidDate, InvoicePaidError };
