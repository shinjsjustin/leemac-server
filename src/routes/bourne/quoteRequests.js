const { BadQuery, parseInteger, pick } = require('../../lib/bourne/helpers');

const DEFAULT_MIMETYPE = 'application/octet-stream';
// Quotes and backslashes would break the quoted header value; control characters allow header injection.
const UNSAFE_FILENAME_CHARS = /["\\\x00-\x1f\x7f]/g;

const LINE_FIELDS = ['id', 'position', 'part_number', 'description', 'rev', 'material', 'finish',
    'quantity', 'part_id', 'bourne_suggestion'];
const FILE_FIELDS = ['id', 'line_id', 'filename', 'mimetype', 'size'];

function parseSuggestion(value) {
    return typeof value === 'string' ? JSON.parse(value) : value;
}

function failure(res, e, message) {
    if (e instanceof BadQuery) return res.status(400).json({ error: e.message });
    console.error(e);
    return res.status(500).json({ error: message });
}

function quoteRequestsHandler(db) {
    return async (req, res) => {
        try {
            const [rows] = await db.execute(
                `SELECT r.id, c.name AS company, r.client_name, r.name, r.need_by, r.status, r.submitted_at,
                        (SELECT COUNT(*) FROM quote_request_line l WHERE l.request_id = r.id) AS line_count
                 FROM quote_request r
                 LEFT JOIN company c ON c.id = r.company_id
                 WHERE r.status <> 'draft'
                 ORDER BY r.submitted_at DESC, r.id DESC`, []);
            res.json({ quoteRequests: rows.map((r) => pick(r, ['id', 'company', 'client_name', 'name',
                'need_by', 'status', 'submitted_at', 'line_count'])) });
        } catch (e) {
            failure(res, e, 'Failed to fetch quote requests.');
        }
    };
}

function quoteRequestDetailHandler(db) {
    return async (req, res) => {
        try {
            const id = parseInteger(req.params.id, 'id');
            const [headers] = await db.execute(
                `SELECT r.id, c.name AS company, r.client_name, r.name, r.need_by, r.note, r.status, r.job_id,
                        r.submitted_at, r.reviewed_at
                 FROM quote_request r
                 LEFT JOIN company c ON c.id = r.company_id
                 WHERE r.id = ? AND r.status <> 'draft'`, [id]);
            if (headers.length === 0) return res.status(404).json({ error: 'Quote request not found.' });

            const [lines] = await db.execute(
                `SELECT id, position, part_number, description, rev, material, finish, quantity, part_id,
                        bourne_suggestion
                 FROM quote_request_line WHERE request_id = ? ORDER BY position, id`, [id]);
            const [files] = await db.execute(
                `SELECT id, line_id, filename, mimetype, size
                 FROM quote_request_file WHERE request_id = ? ORDER BY id`, [id]);

            res.json({
                quoteRequest: {
                    ...pick(headers[0], ['id', 'company', 'client_name', 'name', 'need_by', 'note', 'status',
                        'job_id', 'submitted_at', 'reviewed_at']),
                    lines: lines.map((l) => ({
                        ...pick(l, LINE_FIELDS),
                        bourne_suggestion: parseSuggestion(l.bourne_suggestion),
                    })),
                    files: files.map((f) => pick(f, FILE_FIELDS)),
                },
            });
        } catch (e) {
            failure(res, e, 'Failed to fetch quote request.');
        }
    };
}

function quoteRequestFileHandler(db) {
    return async (req, res) => {
        try {
            const id = parseInteger(req.params.id, 'id');
            const fileId = parseInteger(req.params.fileId, 'fileId');
            const [rows] = await db.execute(
                `SELECT f.id, f.filename, f.mimetype, f.content
                 FROM quote_request_file f
                 JOIN quote_request r ON r.id = f.request_id
                 WHERE f.id = ? AND f.request_id = ? AND r.status <> 'draft'`,
                [fileId, id]);
            if (rows.length === 0) return res.status(404).json({ error: 'File not found.' });

            const { filename, mimetype, content } = rows[0];
            const safeName = String(filename ?? '').replace(UNSAFE_FILENAME_CHARS, '');
            res.set({
                'Content-Type': mimetype || DEFAULT_MIMETYPE,
                'Content-Length': content.length,
                'Content-Disposition': `inline; filename="${safeName}"`,
            });
            res.end(content);
        } catch (e) {
            failure(res, e, 'Failed to fetch file.');
        }
    };
}

module.exports = { quoteRequestsHandler, quoteRequestDetailHandler, quoteRequestFileHandler };
