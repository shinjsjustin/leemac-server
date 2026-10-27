const PDF_MAGIC = '%PDF';
const DEFAULT_MAX_BYTES = 20 * 1024 * 1024;

class ExportReplyError extends Error {
    constructor(status, message) {
        super(message);
        this.name = 'ExportReplyError';
        this.status = status;
    }
}

const readJson = async (response) => {
    if (typeof response?.text !== 'function') return null;
    try {
        return JSON.parse(await response.text());
    } catch {
        return null;
    }
};

// The old script returns nothing useful, so a missing PDF means "legacy", not failure.
const parseExportReply = async (response, { jobNumber, maxBytes = DEFAULT_MAX_BYTES }) => {
    const reply = await readJson(response);
    if (typeof reply?.pdfBase64 !== 'string') return { pdf: null, legacy: true };

    if (reply.ok === false) {
        throw new ExportReplyError(502, `Export script error: ${reply.error}`);
    }
    if (reply.jobNumber === undefined || reply.jobNumber === null) {
        throw new ExportReplyError(502, 'Export script reply has no job number');
    }
    const got = String(reply.jobNumber).trim();
    const expected = String(jobNumber).trim();
    if (got !== expected) {
        throw new ExportReplyError(409, `Export PDF is for job ${got}, not job ${expected}; not saved`);
    }

    const pdf = Buffer.from(reply.pdfBase64, 'base64');
    if (pdf.length === 0) throw new ExportReplyError(502, 'Export PDF is empty');
    if (pdf.subarray(0, PDF_MAGIC.length).toString('latin1') !== PDF_MAGIC) {
        throw new ExportReplyError(502, 'Export reply is not a PDF');
    }
    if (pdf.length > maxBytes) throw new ExportReplyError(502, 'Export PDF is too large');
    return { pdf, legacy: false };
};

module.exports = { ExportReplyError, parseExportReply };
