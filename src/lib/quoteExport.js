const { loadJobSummary } = require('./jobSummary');
const { populateSheet } = require('./quoteSheet');

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

const exportQuote = async (
    db,
    jobId,
    { getSheet = getQuoteSheet, post = fetch, scriptUrl = process.env.GSCRIPT_URL } = {}
) => {
    if (!scriptUrl) throw new QuoteExportError(503, 'Quote export is not configured');

    const summary = await loadJobSummary(db, jobId);
    if (!summary) throw new QuoteExportError(404, 'Job not found');

    const sheet = await getSheet();
    await populateSheet(sheet, summary.job, summary.parts);

    const response = await post(scriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'exportQuote' }),
    });
    if (!response.ok) throw new QuoteExportError(502, 'Quote export script failed');

    return { id: jobId, action: 'exportQuote', parts: summary.parts.length };
};

module.exports = { QuoteExportError, getQuoteSheet, exportQuote };
