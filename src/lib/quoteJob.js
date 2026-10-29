const { normalizePrice } = require('./price');

const DEFAULT_PRICE = 1;
const BAD_REQUEST = 400;
const SERVER_ERROR = 500;

class QuoteJobError extends Error {
    constructor(message, status) {
        super(message);
        this.name = 'QuoteJobError';
        this.status = status;
    }
}

const text = (value) => (value != null ? String(value).trim() : '');

// Normalise and validate every part before a transaction is opened.
function normaliseParts(parts) {
    return parts.map((part) => {
        const partNumber = text(part && part.part_number);
        const quantity = Number(part && part.quantity);
        if (!partNumber) {
            throw new QuoteJobError('Each part requires a part_number', BAD_REQUEST);
        }
        if (!Number.isInteger(quantity) || quantity < 1) {
            throw new QuoteJobError(`Invalid quantity for part ${partNumber}`, BAD_REQUEST);
        }

        let price;
        try {
            price = normalizePrice(part.price);
        } catch (e) {
            throw new QuoteJobError(`Invalid price for part ${partNumber}`, BAD_REQUEST);
        }

        const material = text(part.material);
        const finish = text(part.finish);
        // Material first, then finish, each token prefixed with '*'; empty tokens omitted.
        const details = [material, finish]
            .filter((token) => token.length > 0)
            .map((token) => `*${token}`)
            .join(' ');

        return {
            partNumber,
            description: part.description != null ? String(part.description) : null,
            quantity,
            price: price === null ? DEFAULT_PRICE : price,
            rev: text(part.rev) || null,
            material: material || null,
            finish: finish || null,
            stockSize: text(part.stock_size) || null,
            details,
        };
    });
}

function validateBody(body) {
    const { company_id, attention, parts } = body || {};

    if (!company_id) {
        throw new QuoteJobError('company_id is required', BAD_REQUEST);
    }
    if (!Array.isArray(parts) || parts.length === 0) {
        throw new QuoteJobError('parts must be a non-empty array', BAD_REQUEST);
    }
    return { companyId: company_id, attention, normalisedParts: normaliseParts(parts) };
}

// Allocates the next job number (counter + 1, stored back as the counter, like
// AddJob.js), inserts the job and links each part. The caller owns the transaction.
async function insertQuoteJob(connection, body) {
    const { companyId, attention, normalisedParts } = validateBody(body);

    // Lock the counter row so concurrent callers cannot collide on job_number.
    const [counterRows] = await connection.execute(
        `SELECT metavalue FROM metadata WHERE metakey = 'current_job_num' FOR UPDATE`
    );
    if (counterRows.length === 0) {
        throw new QuoteJobError('Job number counter is not configured', SERVER_ERROR);
    }

    const jobNumber = String(Number(JSON.parse(counterRows[0].metavalue)) + 1);

    const [jobResult] = await connection.execute(
        `INSERT INTO job (job_number, company_id, attention) VALUES (?, ?, ?)`,
        [jobNumber, companyId, attention ?? null]
    );
    const jobId = jobResult.insertId;

    await connection.execute(
        `REPLACE INTO metadata (metakey, metavalue) VALUES ('current_job_num', JSON_QUOTE(?))`,
        [jobNumber]
    );

    const jobPartIds = [];
    const partIds = [];
    for (const part of normalisedParts) {
        const [partResult] = await connection.execute(
            `INSERT IGNORE INTO part (number, description) VALUES (?, ?)`,
            [part.partNumber, part.description]
        );

        let partId = partResult.insertId;
        if (partResult.affectedRows === 0) {
            const [existingRows] = await connection.execute(
                `SELECT id FROM part WHERE number = ?`,
                [part.partNumber]
            );
            partId = existingRows[0].id;
        }

        const [jobPartResult] = await connection.execute(
            `INSERT INTO job_part (job_id, part_id, quantity, price, rev, material, finish, stock_size, details) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [jobId, partId, part.quantity, part.price, part.rev, part.material, part.finish, part.stockSize, part.details]
        );
        jobPartIds.push(jobPartResult.insertId);
        partIds.push(partId);
    }

    return { id: jobId, job_number: jobNumber, job_part_ids: jobPartIds, part_ids: partIds };
}

async function createQuoteJob(db, body) {
    validateBody(body);

    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();
        const result = await insertQuoteJob(connection, body);
        await connection.commit();
        return { id: result.id, job_number: result.job_number, job_part_ids: result.job_part_ids };
    } catch (e) {
        await connection.rollback();
        throw e;
    } finally {
        connection.release();
    }
}

module.exports = { createQuoteJob, insertQuoteJob, QuoteJobError, normaliseParts };
