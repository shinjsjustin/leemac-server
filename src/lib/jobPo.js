const PO_NUMBER_MAX = 50;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PO_COLUMNS = ['po_number', 'po_date', 'due_date', 'tax_code', 'tax', 'tax_percent'];

class PoError extends Error {
    constructor(message, status = 400) {
        super(message);
        this.name = 'PoError';
        this.status = status;
    }
}

const isDateOrNull = (v) => v === null || (typeof v === 'string' && DATE_RE.test(v));
const isNonNegative = (v) => typeof v === 'number' && v >= 0;

function validatePoFields(body) {
    const poNumber = typeof body.po_number === 'string' ? body.po_number.trim() : '';
    if (poNumber.length < 1 || poNumber.length > PO_NUMBER_MAX) {
        throw new PoError(`po_number must be 1-${PO_NUMBER_MAX} characters`);
    }
    if (!isDateOrNull(body.po_date)) throw new PoError('po_date must be YYYY-MM-DD or null');
    if (!isDateOrNull(body.due_date)) throw new PoError('due_date must be YYYY-MM-DD or null');
    if (body.tax_code !== 0 && body.tax_code !== 1) throw new PoError('tax_code must be 0 or 1');
    if (!isNonNegative(body.tax)) throw new PoError('tax must be a number >= 0');
    if (!isNonNegative(body.tax_percent)) throw new PoError('tax_percent must be a number >= 0');
}

// Without onlyPresent this builds the web page's update: four main columns always,
// tax and tax_percent only when above 0. Column names come from PO_COLUMNS, never input.
async function updateJobPo(db, jobId, fields, { onlyPresent = false } = {}) {
    let columns;
    if (onlyPresent) {
        columns = PO_COLUMNS.filter((c) => fields[c] !== undefined);
        if (columns.length === 0) throw new PoError('No PO fields to update');
    } else {
        columns = PO_COLUMNS.slice(0, 4);
        if (fields.tax > 0) columns.push('tax');
        if (fields.tax_percent > 0) columns.push('tax_percent');
    }
    const sql = `UPDATE job SET ${columns.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`;
    await db.execute(sql, [...columns.map((c) => fields[c]), jobId]);
}

module.exports = { PoError, validatePoFields, updateJobPo };
