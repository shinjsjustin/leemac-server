const ATTENTION_MAX_LENGTH = 100; // job.attention is VARCHAR(100)
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

class DetailsError extends Error {
    constructor(message, status = 400) {
        super(message);
        this.name = 'DetailsError';
        this.status = status;
    }
}

const isDateOrNull = (v) => v === null || (typeof v === 'string' && DATE_RE.test(v));

// Body key -> job column and its normalizer. Column names come only from this fixed map,
// never from input, so the dynamic SET clause is safe from SQL injection.
const JOB_FIELDS = {
    attention: {
        column: 'attention',
        clean: (v) => {
            if (typeof v !== 'string') throw new DetailsError('attention must be a string');
            const trimmed = v.trim();
            if (trimmed.length > ATTENTION_MAX_LENGTH) {
                throw new DetailsError(`attention must be at most ${ATTENTION_MAX_LENGTH} characters`);
            }
            return trimmed || null;
        },
    },
    company_id: {
        column: 'company_id',
        clean: (v) => {
            if (!Number.isInteger(v) || v < 1) throw new DetailsError('company_id must be a positive integer');
            return v;
        },
    },
    due_date: {
        column: 'due_date',
        clean: (v) => {
            if (!isDateOrNull(v)) throw new DetailsError('due_date must be YYYY-MM-DD or null');
            return v;
        },
    },
    ship_date: {
        column: 'ship_date',
        clean: (v) => {
            if (!isDateOrNull(v)) throw new DetailsError('ship_date must be YYYY-MM-DD or null');
            return v;
        },
    },
};

async function updateJobDetails(db, jobId, body) {
    const columns = [];
    const params = [];
    for (const [key, { column, clean }] of Object.entries(JOB_FIELDS)) {
        if (!Object.prototype.hasOwnProperty.call(body, key)) continue;
        const raw = body[key] === '' ? null : body[key];
        columns.push(`${column} = ?`);
        params.push(key === 'company_id' || raw !== null ? clean(raw) : null);
    }
    if (columns.length === 0) throw new DetailsError('No fields to update');

    const [result] = await db.execute(`UPDATE job SET ${columns.join(', ')} WHERE id = ?`, [...params, jobId]);
    if (result.affectedRows === 0) throw new DetailsError('Job not found', 404);
}

async function updatePartDetails(db, partId, body) {
    const columns = [];
    const params = [];
    if (body.number !== undefined) {
        const number = typeof body.number === 'string' ? body.number.trim() : '';
        if (!number) throw new DetailsError('number must be a non-empty string');
        columns.push('number = ?');
        params.push(number);
    }
    if (body.description !== undefined) {
        if (typeof body.description !== 'string') throw new DetailsError('description must be a string');
        columns.push('description = ?');
        params.push(body.description.trim());
    }
    if (columns.length === 0) throw new DetailsError('No fields to update');

    const [part] = await db.execute('SELECT id FROM part WHERE id = ?', [partId]);
    if (part.length === 0) throw new DetailsError('Part not found', 404);

    if (body.number !== undefined) {
        const [taken] = await db.execute('SELECT id FROM part WHERE number = ? AND id <> ?', [params[0], partId]);
        if (taken.length > 0) throw new DetailsError('Part number already exists', 409);
    }

    await db.execute(`UPDATE part SET ${columns.join(', ')} WHERE id = ?`, [...params, partId]);
    return { id: partId };
}

module.exports = { DetailsError, updateJobDetails, updatePartDetails };
