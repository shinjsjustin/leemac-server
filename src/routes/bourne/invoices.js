const MAX_NUMBER_LENGTH = 50;
// Quotes and backslashes would break the quoted header value; control characters allow header injection.
const UNSAFE_FILENAME_CHARS = /["\\\x00-\x1f\x7f]/g;

function invoicePdfHandler(db) {
    return async (req, res) => {
        try {
            const number = String(req.params.number ?? '').trim();
            if (!number || number.length > MAX_NUMBER_LENGTH) {
                return res.status(400).json({ error: `Invoice number must be 1-${MAX_NUMBER_LENGTH} characters.` });
            }

            const [jobs] = await db.execute(
                'SELECT id, job_number FROM job WHERE invoice_number_key = ?', [number]);
            if (jobs.length === 0) return res.status(404).json({ error: 'Invoice not found.' });

            const [files] = await db.execute(
                `SELECT id, filename, mimetype, content FROM uploaded_files
                 WHERE job_id = ? AND filename LIKE 'Invoice-%-site.pdf'
                 ORDER BY uploaded_at DESC, id DESC LIMIT 1`, [jobs[0].id]);
            if (files.length === 0) return res.status(404).json({ error: 'No saved PDF for this invoice.' });

            const { filename, content } = files[0];
            const safeName = String(filename ?? '').replace(UNSAFE_FILENAME_CHARS, '');
            res.set({
                'Content-Type': 'application/pdf',
                'Content-Length': content.length,
                'Content-Disposition': `inline; filename="${safeName}"`,
            });
            res.end(content);
        } catch (e) {
            console.error(e);
            res.status(500).json({ error: 'Failed to fetch invoice PDF.' });
        }
    };
}

module.exports = { invoicePdfHandler };
