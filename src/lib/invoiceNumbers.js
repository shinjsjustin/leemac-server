const DUP_INDEX = 'uq_job_invoice_number';

// Highest all-digit invoice number plus one; non-numeric numbers are ignored.
async function nextInvoiceNumber(db) {
    const [rows] = await db.execute(
        `SELECT MAX(CAST(TRIM(invoice_number) AS UNSIGNED)) AS max_number
         FROM job WHERE TRIM(invoice_number) REGEXP '^[0-9]+$'`
    );
    return String(Number(rows[0]?.max_number || 0) + 1);
}

// job_number of another job that already uses this (trimmed) invoice number, or null.
async function invoiceNumberOwner(db, number, exceptJobId) {
    const [rows] = await db.execute(
        `SELECT job_number FROM job WHERE TRIM(invoice_number) = ? AND id <> ? LIMIT 1`,
        [number, exceptJobId]
    );
    return rows.length ? rows[0].job_number : null;
}

function isDuplicateInvoice(err) {
    return Boolean(err) && err.code === 'ER_DUP_ENTRY' && String(err.message).includes(DUP_INDEX);
}

module.exports = { nextInvoiceNumber, invoiceNumberOwner, isDuplicateInvoice };
