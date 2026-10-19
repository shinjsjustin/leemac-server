const { normalizePrice } = require('./price');
const { QuoteJobError, normaliseParts } = require('./quoteJob');

const BAD_REQUEST = 400;
const NOT_FOUND = 404;
const CONFLICT = 409;

class JobPartError extends Error {
    constructor(message, status) {
        super(message);
        this.name = 'JobPartError';
        this.status = status;
    }
}

const cleanText = (value) => {
    const text = value != null ? String(value).trim() : '';
    return text === '' ? null : text;
};

const toQuantity = (value) => {
    const quantity = Number(value);
    if (!Number.isInteger(quantity) || quantity < 1) {
        throw new JobPartError('Invalid quantity', BAD_REQUEST);
    }
    return quantity;
};

const toPrice = (value) => {
    try {
        return normalizePrice(value);
    } catch (e) {
        throw new JobPartError('Invalid price', BAD_REQUEST);
    }
};

async function resolvePartId(db, body, part) {
    if (body.part_id) {
        const [rows] = await db.execute(`SELECT id FROM part WHERE id = ?`, [body.part_id]);
        if (rows.length === 0) throw new JobPartError('Part not found', NOT_FOUND);
        return rows[0].id;
    }

    const [result] = await db.execute(
        `INSERT IGNORE INTO part (number, description) VALUES (?, ?)`,
        [part.partNumber, part.description]
    );
    if (result.affectedRows !== 0) return result.insertId;

    const [rows] = await db.execute(`SELECT id FROM part WHERE number = ?`, [part.partNumber]);
    return rows[0].id;
}

// Links an existing part (part_id) or a part_number, created when new, to a job.
async function addPartToJob(db, jobId, body) {
    const input = body || {};
    if (!input.part_id && !cleanText(input.part_number)) {
        throw new JobPartError('part_id or part_number is required', BAD_REQUEST);
    }

    let part;
    try {
        // normaliseParts needs a part_number; a part_id request supplies its id instead.
        [part] = normaliseParts([{ ...input, part_number: input.part_number || String(input.part_id) }]);
    } catch (e) {
        if (e instanceof QuoteJobError) throw new JobPartError(e.message, e.status);
        throw e;
    }

    const partId = await resolvePartId(db, input, part);
    const [result] = await db.execute(
        `INSERT INTO job_part (job_id, part_id, quantity, price, rev, material, finish, stock_size, details) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [jobId, partId, part.quantity, part.price, part.rev, part.material, part.finish, part.stockSize, part.details]
    );
    return { job_part_id: result.insertId, part_id: partId };
}

const UPDATE_FIELDS = {
    quantity: toQuantity,
    price: toPrice,
    rev: cleanText,
    details: cleanText,
    note: cleanText,
    material: cleanText,
    finish: cleanText,
    stock_size: cleanText,
};

// Updates only the whitelisted fields present in body, on a job_part of this job.
async function updateJobPart(db, jobId, jobPartId, body) {
    const input = body || {};
    const sent = Object.keys(UPDATE_FIELDS).filter((field) => field in input);
    if (sent.length === 0) {
        throw new JobPartError('No fields to update', BAD_REQUEST);
    }
    const values = sent.map((field) => UPDATE_FIELDS[field](input[field]));

    const [rows] = await db.execute(
        `SELECT id FROM job_part WHERE id = ? AND job_id = ?`,
        [jobPartId, jobId]
    );
    if (rows.length === 0) throw new JobPartError('Job part not found', NOT_FOUND);

    await db.execute(
        `UPDATE job_part SET ${sent.map((field) => `${field} = ?`).join(', ')} WHERE id = ? AND job_id = ?`,
        [...values, jobPartId, jobId]
    );
}

// Deletes the job_part and its star; the part and its files are kept.
async function removeJobPart(db, jobId, jobPartId) {
    const [rows] = await db.execute(
        `SELECT j.invoice_number FROM job_part jp JOIN job j ON j.id = jp.job_id WHERE jp.id = ? AND jp.job_id = ?`,
        [jobPartId, jobId]
    );
    if (rows.length === 0) throw new JobPartError('Job part not found', NOT_FOUND);
    if (rows[0].invoice_number) throw new JobPartError('Job is invoiced', CONFLICT);

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        await connection.execute(`DELETE FROM stars WHERE job_part_id = ?`, [jobPartId]);
        await connection.execute(`DELETE FROM job_part WHERE id = ? AND job_id = ?`, [jobPartId, jobId]);
        await connection.commit();
    } catch (e) {
        await connection.rollback();
        throw e;
    } finally {
        connection.release();
    }
}

module.exports = { JobPartError, addPartToJob, updateJobPart, removeJobPart };
