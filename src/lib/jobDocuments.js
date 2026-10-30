const { DOCUMENT_TYPES, renderDocumentHtml } = require('./documents');
const { formFromSummary, dataFromForm, formatDate } = require('./documents/data');
const { nextInvoiceNumber, invoiceNumberOwner, isDuplicateInvoice } = require('./invoiceNumbers');
const { loadJobSummary } = require('./jobSummary');
const { insertJobFiles } = require('./jobFiles');

const GATED_TYPES = ['packing', 'shipping', 'invoice'];
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

const parseJson = (value) => (typeof value === 'string' ? JSON.parse(value) : value);

async function loadSaved(db, jobId, type) {
    const [rows] = await db.execute(
        `SELECT fields, parts, file_id, saved_at, saved_by_name FROM job_document WHERE job_id = ? AND type = ?`,
        [jobId, type]
    );
    return rows[0] || null;
}

// Throws 400 for a bad type and 404 for a missing job.
async function loadSummary(db, jobId, type) {
    if (!Object.hasOwn(DOCUMENT_TYPES, type)) throw new DocumentError(400, `Unknown document type: ${type}`);
    const summary = await loadJobSummary(db, jobId);
    if (!summary) throw new DocumentError(404, 'Job not found');
    if (GATED_TYPES.includes(type) && !summary.job.invoice_clicked_at) {
        throw new DocumentError(409, 'Click Update invoice first');
    }
    return summary;
}

// Brings an older snapshot up to date: a missing leadtime comes from the job, and a ship date saved
// before the latest invoice click gives way to the click date. Later manual edits stay.
function adjustSnapshot(type, summary, row) {
    const fields = parseJson(row.fields);
    const adjusted = { ...fields };
    if (!adjusted.leadtime) adjusted.leadtime = formFromSummary(summary).fields.leadtime;
    const clicked = summary.job.invoice_clicked_at;
    if (GATED_TYPES.includes(type) && new Date(row.saved_at) < new Date(clicked)) {
        adjusted.dates = { ...fields.dates, ship: formatDate(clicked) };
    }
    return adjusted;
}

const unsavedDocument = (type, summary) => ({
    type, saved: false, savedAt: null, savedBy: null, fileId: null, ...formFromSummary(summary),
});

async function getDocument(db, jobId, type) {
    const summary = await loadSummary(db, jobId, type);
    const row = await loadSaved(db, jobId, type);
    if (!row) return unsavedDocument(type, summary);
    return {
        type, saved: true, savedAt: row.saved_at, savedBy: row.saved_by_name, fileId: row.file_id,
        fields: adjustSnapshot(type, summary, row), parts: parseJson(row.parts),
    };
}

async function refillDocument(db, jobId, type) {
    return unsavedDocument(type, await loadSummary(db, jobId, type));
}

async function renderDocumentPdf(renderPdf, type, data) {
    try {
        return await renderPdf(renderDocumentHtml(type, data), { size: DOCUMENT_TYPES[type].size });
    } catch (err) {
        if (err.code === 'RENDERER_UNAVAILABLE') throw new DocumentError(503, err.message);
        throw err;
    }
}

async function storePdf(db, jobId, type, summary, pdf, now) {
    const filename = `${DOCUMENT_TYPES[type].label}-${summary.job.job_number}-${stamp(now())}${SITE_SUFFIX}`;
    const [fileId] = await insertJobFiles(db, jobId, [
        { originalname: filename, mimetype: 'application/pdf', size: pdf.length, buffer: pdf },
    ]);
    return { fileId, filename };
}

// Picks the invoice number, rejects one used by another job, and returns fields carrying it.
async function withInvoiceNumber(db, jobId, summary, fields) {
    const typed = String(fields.invoiceNumber ?? '').trim();
    const stored = String(summary.job.invoice_number ?? '').trim();
    const number = typed || stored || (await nextInvoiceNumber(db));
    const owner = await invoiceNumberOwner(db, number, jobId);
    if (owner) throw new DocumentError(409, `Invoice number ${number} is already used by job ${owner}`);
    return { ...fields, invoiceNumber: number };
}

const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

async function writeInvoiceToJob(db, jobId, number, now) {
    try {
        await db.execute(
            `UPDATE job SET invoice_number = ?, invoice_date = COALESCE(invoice_date, ?) WHERE id = ?`,
            [number, isoDate(now()), jobId]
        );
    } catch (err) {
        if (isDuplicateInvoice(err)) throw new DocumentError(409, `Invoice number ${number} is already in use`);
        throw err;
    }
}

function assertSaveBody(body) {
    const { fields, parts } = body ?? {};
    const isPlainObject = fields !== null && typeof fields === 'object' && !Array.isArray(fields);
    if (!isPlainObject || !Array.isArray(parts)) {
        throw new DocumentError(400, 'Body must have a fields object and a parts array');
    }
}

// A blank invoice date means "today", so the PDF and snapshot match the date the job row gets.
const withInvoiceDate = (fields, now) =>
    fields.dates?.invoice ? fields : { ...fields, dates: { ...fields.dates, invoice: formatDate(now()) } };

async function saveDocument(db, jobId, type, body, user, { renderPdf = defaultRenderPdf, now = () => new Date() } = {}) {
    assertSaveBody(body);
    const { fields, parts } = body;
    const summary = await loadSummary(db, jobId, type);
    const saveFields = type === 'invoice'
        ? withInvoiceDate(await withInvoiceNumber(db, jobId, summary, fields), now)
        : fields;

    const pdf = await renderDocumentPdf(renderPdf, type, dataFromForm({ fields: saveFields, parts }));
    // Written before storePdf so a racing duplicate number (409) leaves no orphan file or snapshot.
    if (type === 'invoice') await writeInvoiceToJob(db, jobId, saveFields.invoiceNumber, now);
    const { fileId } = await storePdf(db, jobId, type, summary, pdf, now);
    const leadtime = String(fields.leadtime ?? '').trim();
    if ((type === 'quote' || type === 'order') && leadtime) {
        await db.execute(`UPDATE job SET leadtime = ? WHERE id = ?`, [leadtime, jobId]);
    }

    const savedBy = user.name || user.email || null;
    await db.execute(
        `INSERT INTO job_document (job_id, type, fields, parts, file_id, saved_by_id, saved_by_name, saved_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE fields = VALUES(fields), parts = VALUES(parts), file_id = VALUES(file_id),
             saved_by_id = VALUES(saved_by_id), saved_by_name = VALUES(saved_by_name), saved_at = VALUES(saved_at)`,
        [jobId, type, JSON.stringify(saveFields), JSON.stringify(parts), fileId, user.id ?? null, savedBy, now()]
    );
    return getDocument(db, jobId, type);
}

async function makeDocument(db, jobId, type, { renderPdf = defaultRenderPdf, now = () => new Date() } = {}) {
    const summary = await loadSummary(db, jobId, type);
    const row = await loadSaved(db, jobId, type);
    const form = row ? { fields: adjustSnapshot(type, summary, row), parts: parseJson(row.parts) } : formFromSummary(summary);

    const pdf = await renderDocumentPdf(renderPdf, type, dataFromForm(form));
    const { fileId, filename } = await storePdf(db, jobId, type, summary, pdf, now);
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

module.exports = { DocumentError, makeDocument, latestDocuments, getDocument, refillDocument, saveDocument };
