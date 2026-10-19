const BAD_REQUEST = 400;
const NOT_FOUND = 404;
const MAX_LINKS = 500;
const MAX_FIELD_LENGTH = 255;

class EmailLinkError extends Error {
    constructor(message, status) {
        super(message);
        this.name = 'EmailLinkError';
        this.status = status;
    }
}

const isId = (v) => Number.isInteger(v) && v > 0;
const optionalText = (v) => (v == null ? null : String(v).slice(0, MAX_FIELD_LENGTH));

function validateLink(link, index) {
    const fail = (msg) => new EmailLinkError(`links[${index}]: ${msg}`, BAD_REQUEST);
    const input = link || {};
    const hasJob = input.job_id != null;
    const hasPart = input.part_id != null;
    if (hasJob === hasPart || (hasJob ? !isId(input.job_id) : !isId(input.part_id))) {
        throw fail('exactly one of job_id or part_id must be a positive integer');
    }

    const messageId = String(input.message_id ?? '').trim().replace(/^<|>$/g, '').trim();
    if (!messageId) throw fail('message_id is required');
    if (messageId.length > MAX_FIELD_LENGTH) throw fail(`message_id must be at most ${MAX_FIELD_LENGTH} characters`);

    const date = new Date(input.date);
    if (input.date == null || Number.isNaN(date.getTime())) throw fail('date must be a valid date');

    return {
        column: hasJob ? 'job_id' : 'part_id',
        id: hasJob ? input.job_id : input.part_id,
        messageId,
        subject: optionalText(input.subject),
        from: optionalText(input.from),
        sentAt: date.toISOString().slice(0, 19).replace('T', ' '),
    };
}

async function missingIds(connection, table, ids) {
    if (ids.length === 0) return [];
    const [rows] = await connection.execute(`SELECT id FROM ${table} WHERE id IN (?)`, [ids]);
    const found = new Set(rows.map((r) => r.id));
    return ids.filter((id) => !found.has(id));
}

async function assertTargetsExist(connection, items) {
    const idsOf = (column) => [...new Set(items.filter((i) => i.column === column).map((i) => i.id))];
    const missingJobs = await missingIds(connection, 'job', idsOf('job_id'));
    const missingParts = await missingIds(connection, 'part', idsOf('part_id'));
    if (missingJobs.length === 0 && missingParts.length === 0) return;
    const named = [
        ...(missingJobs.length ? [`job ${missingJobs.join(', ')}`] : []),
        ...(missingParts.length ? [`part ${missingParts.join(', ')}`] : []),
    ];
    throw new EmailLinkError(`Not found: ${named.join('; ')}`, NOT_FOUND);
}

// Links jobs or parts to emails; pairs already linked are reused, not duplicated.
async function addEmailLinks(db, links, { createdBy }) {
    if (!Array.isArray(links) || links.length < 1 || links.length > MAX_LINKS) {
        throw new EmailLinkError(`links must be an array of 1 to ${MAX_LINKS} items`, BAD_REQUEST);
    }
    const items = links.map(validateLink);

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        await assertTargetsExist(connection, items);
        const ids = [];
        let created = 0;
        for (const item of items) {
            const [found] = await connection.execute(
                `SELECT id FROM email_link WHERE ${item.column} = ? AND message_id = ?`,
                [item.id, item.messageId]);
            if (found.length > 0) {
                ids.push(found[0].id);
                continue;
            }
            const [result] = await connection.execute(
                `INSERT INTO email_link (${item.column}, message_id, subject, from_address, sent_at, created_by)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [item.id, item.messageId, item.subject, item.from, item.sentAt, createdBy]);
            ids.push(result.insertId);
            created += 1;
        }
        await connection.commit();
        return { created, existing: items.length - created, ids };
    } catch (e) {
        await connection.rollback();
        throw e;
    } finally {
        connection.release();
    }
}

// db may be the SELECT-only Bourne db, so this stays a single statement without a semicolon.
async function listEmailLinks(db, { jobId, partId }) {
    const column = jobId != null ? 'job_id' : 'part_id';
    const [rows] = await db.execute(
        `SELECT id, message_id, subject, from_address, sent_at, created_by
         FROM email_link WHERE ${column} = ? ORDER BY sent_at DESC, id DESC`,
        [jobId != null ? jobId : partId]);
    return rows.map((r) => ({
        id: r.id,
        message_id: r.message_id,
        subject: r.subject,
        from: r.from_address,
        date: r.sent_at,
        created_by: r.created_by,
    }));
}

async function removeEmailLink(db, id) {
    const [result] = await db.execute(`DELETE FROM email_link WHERE id = ?`, [id]);
    if (result.affectedRows === 0) throw new EmailLinkError('Email link not found', NOT_FOUND);
}

module.exports = { EmailLinkError, addEmailLinks, listEmailLinks, removeEmailLink };
