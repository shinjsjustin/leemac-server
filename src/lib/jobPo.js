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

const RULES = {
    po_number: (v) => {
        if (typeof v !== 'string' || v.trim().length < 1 || v.trim().length > PO_NUMBER_MAX) {
            throw new PoError(`po_number must be 1-${PO_NUMBER_MAX} characters`);
        }
    },
    po_date: (v) => { if (!isDateOrNull(v)) throw new PoError('po_date must be YYYY-MM-DD or null'); },
    due_date: (v) => { if (!isDateOrNull(v)) throw new PoError('due_date must be YYYY-MM-DD or null'); },
    tax_code: (v) => { if (v !== 0 && v !== 1) throw new PoError('tax_code must be 0 or 1'); },
    tax: (v) => { if (!isNonNegative(v)) throw new PoError('tax must be a number >= 0'); },
    tax_percent: (v) => { if (!isNonNegative(v)) throw new PoError('tax_percent must be a number >= 0'); },
};

// Returns a new object of the known PO keys that were checked, with po_number trimmed.
// Full mode requires every key; partial mode checks only the keys present.
function validatePoFields(body, { partial = false } = {}) {
    const keys = partial ? PO_COLUMNS.filter((c) => body[c] !== undefined) : PO_COLUMNS;
    if (keys.length === 0) throw new PoError('No PO fields to update');
    const fields = {};
    for (const key of keys) {
        RULES[key](body[key]);
        fields[key] = key === 'po_number' ? body[key].trim() : body[key];
    }
    return fields;
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
