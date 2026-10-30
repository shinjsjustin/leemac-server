const { DOCUMENT_TYPES, renderDocumentHtml } = require('./documents');
const { documentData } = require('./documents/data');
const { loadJobSummary } = require('./jobSummary');
const { insertJobFiles } = require('./jobFiles');

const SITE_SUFFIX = '-site.pdf';

class DocumentError extends Error {
    constructor(status, message) {
        super(message);
        this.name = 'DocumentError';
        this.status = status;
    }
}

const pad = (n) => String(n).padStart(2, '0');
const stamp = (d) =>
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;

// Resolved at call time so requiring this module never loads puppeteer.
const defaultRenderPdf = (html, options) => require('./pdfRenderer').defaultRenderer().renderPdf(html, options);

async function makeDocument(db, jobId, type, { renderPdf = defaultRenderPdf, now = () => new Date() } = {}) {
    if (!Object.hasOwn(DOCUMENT_TYPES, type)) throw new DocumentError(400, `Unknown document type: ${type}`);
    const { label, size } = DOCUMENT_TYPES[type];

    const summary = await loadJobSummary(db, jobId);
    if (!summary) throw new DocumentError(404, 'Job not found');

    const html = renderDocumentHtml(type, documentData(summary));
    let pdf;
    try {
        pdf = await renderPdf(html, { size });
    } catch (err) {
        if (err.code === 'RENDERER_UNAVAILABLE') throw new DocumentError(503, err.message);
        throw err;
    }

    const filename = `${label}-${summary.job.job_number}-${stamp(now())}${SITE_SUFFIX}`;
    const [fileId] = await insertJobFiles(db, jobId, [
        { originalname: filename, mimetype: 'application/pdf', size: pdf.length, buffer: pdf },
    ]);
    return { type, fileId, filename };
}

async function latestDocuments(db, jobId) {
    const [rows] = await db.execute(
        `SELECT id, filename, uploaded_at FROM uploaded_files
         WHERE job_id = ? AND filename LIKE ? ORDER BY uploaded_at DESC, id DESC`,
        [jobId, `%${SITE_SUFFIX}`]
    );
    const latest = {};
    for (const [type, { label }] of Object.entries(DOCUMENT_TYPES)) {
        latest[type] = rows.find((r) => r.filename.startsWith(`${label}-`)) || null;
    }
    return latest;
}

module.exports = { DocumentError, makeDocument, latestDocuments };
