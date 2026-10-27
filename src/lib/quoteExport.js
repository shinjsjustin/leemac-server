const { loadJobSummary } = require('./jobSummary');
const { populateSheet } = require('./quoteSheet');
const { createExportQueue, ExportQueueTimeout } = require('./exportQueue');
const { parseExportReply, ExportReplyError } = require('./exportReply');
const { insertJobFiles } = require('./jobFiles');

const DEFAULT_TIMEOUT_MS = 120000;

const EXPORT_TYPES = {
    quote: { action: 'exportQuote', label: 'Quote' },
    order: { action: 'exportOrder', label: 'Order' },
    invoice: { action: 'exportInvoice', label: 'Invoice' },
    packing: { action: 'exportPackList', label: 'PackingList' },
    shipping: { action: 'exportShipping', label: 'Shipping' },
};

class QuoteExportError extends Error {
    constructor(status, message) {
        super(message);
        this.name = 'QuoteExportError';
        this.status = status;
    }
}

let doc = null;

// Built on first use so requiring this module never touches Google.
const getQuoteSheet = async () => {
    if (!doc) {
        const { GoogleSpreadsheet } = require('google-spreadsheet');
        const { JWT } = require('google-auth-library');
        const auth = new JWT({
            email: process.env.GOOGLE_CLIENT_EMAIL,
            key: (process.env.GOOGLE_SERVICE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });
        doc = new GoogleSpreadsheet(process.env.SPREADSHEET_ID, auth);
    }
    await doc.loadInfo();
    const sheet = doc.sheetsById[process.env.SHEET_ID];
    if (!sheet) throw new QuoteExportError(503, 'Quote sheet not found');
    return sheet;
};

const pad = (n) => String(n).padStart(2, '0');

const stamp = (d) =>
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;

const isTimeout = (err) => err?.name === 'TimeoutError' || err?.name === 'AbortError';

const exportQueue = createExportQueue();

const exportJob = async (
    db,
    jobId,
    type,
    {
        getSheet = getQuoteSheet,
        post = fetch,
        scriptUrl = process.env.GSCRIPT_URL,
        queue = exportQueue,
        timeoutMs = DEFAULT_TIMEOUT_MS,
        now = () => new Date(),
        log = console,
    } = {}
) => {
    const exportType = EXPORT_TYPES[type];
    if (!exportType) throw new QuoteExportError(400, 'Unknown export type');
    if (!scriptUrl) throw new QuoteExportError(503, 'Export is not configured');
    const { action, label } = exportType;

    try {
        return await queue.run(async () => {
            const summary = await loadJobSummary(db, jobId);
            if (!summary) throw new QuoteExportError(404, 'Job not found');
            const jobNumber = summary.job.job_number;

            const sheet = await getSheet();
            await populateSheet(sheet, summary.job, summary.parts);

            let response;
            try {
                response = await post(scriptUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action, jobId: String(jobId), jobNumber }),
                    signal: AbortSignal.timeout(timeoutMs),
                });
            } catch (err) {
                if (isTimeout(err)) throw new QuoteExportError(504, 'Export script timed out');
                throw err;
            }
            if (!response.ok) throw new QuoteExportError(502, 'Export script failed');

            let pdf;
            try {
                ({ pdf } = await parseExportReply(response, { jobNumber }));
            } catch (err) {
                if (err instanceof ExportReplyError) throw new QuoteExportError(err.status, err.message);
                throw err;
            }

            const result = { id: jobId, type, action, jobNumber, parts: summary.parts.length, fileId: null, filename: null };
            if (!pdf) {
                log.warn(`Export ${action} for job ${jobNumber} returned no PDF (old script); nothing saved`);
                return result;
            }

            const filename = `${label}-${jobNumber}-${stamp(now())}.pdf`;
            const [fileId] = await insertJobFiles(db, jobId, [
                { originalname: filename, mimetype: 'application/pdf', size: pdf.length, buffer: pdf },
            ]);
            return { ...result, fileId, filename };
        });
    } catch (err) {
        if (err instanceof ExportQueueTimeout) throw new QuoteExportError(503, err.message);
        throw err;
    }
};

const exportQuote = (db, jobId, opts) => exportJob(db, jobId, 'quote', opts);

const exportJobs = async (db, jobId, types, opts) => {
    if (types.some((type) => !EXPORT_TYPES[type])) throw new QuoteExportError(400, 'Unknown export type');

    const results = [];
    for (const [i, type] of types.entries()) {
        try {
            results.push(await exportJob(db, jobId, type, opts));
        } catch (err) {
            if (!err.status) {
                (opts?.log || console).error(`Export ${type} for job ${jobId} failed`, err);
                return { results, failed: { type, status: 500, error: 'Export failed' }, skipped: types.slice(i + 1) };
            }
            return { results, failed: { type, status: err.status, error: err.message }, skipped: types.slice(i + 1) };
        }
    }
    return { results, failed: null, skipped: [] };
};

module.exports = { QuoteExportError, EXPORT_TYPES, getQuoteSheet, exportQuote, exportJob, exportJobs };
