const { BadQuery, parseInteger } = require('../../lib/bourne/helpers');

const DEFAULT_MIMETYPE = 'application/octet-stream';
// Quotes and backslashes would break the quoted header value; control characters allow header injection.
const UNSAFE_FILENAME_CHARS = /["\\\x00-\x1f\x7f]/g;

function fileHandler(db) {
    return async (req, res) => {
        try {
            const id = parseInteger(req.params.id, 'id');
            const [rows] = await db.execute(
                'SELECT id, filename, mimetype, content FROM uploaded_files WHERE id = ?', [id]);
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
            if (e instanceof BadQuery) return res.status(400).json({ error: e.message });
            console.error(e);
            res.status(500).json({ error: 'Failed to fetch file.' });
        }
    };
}

module.exports = { fileHandler };
