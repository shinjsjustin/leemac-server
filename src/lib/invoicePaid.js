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
async function markInvoicePaid(db, jobId) {
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
        await conn.execute(`UPDATE job SET invoice_status = 'paid' WHERE id = ?`, [jobId]);
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

module.exports = { markInvoicePaid, InvoicePaidError };
