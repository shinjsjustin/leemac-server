const express = require('express');
const sharedDb = require('../db/db');
const { ReportError, parseReportFilter, buildReceivables, buildLedger, buildExpenses } = require('../lib/financeReports');
const { receivablesHtml, ledgerHtml, expensesHtml } = require('../lib/financeReportHtml');
const { reportSheets } = require('../lib/financeReportXlsx');
const { buildXlsx } = require('../lib/xlsx');

const REPORTS = {
    receivables: { build: buildReceivables, html: receivablesHtml, filterOptional: true },
    ledger: { build: buildLedger, html: ledgerHtml },
    expenses: { build: buildExpenses, html: expensesHtml },
};
const FORMATS = {
    pdf: { type: 'application/pdf' },
    xlsx: { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
};

const pad = (n) => String(n).padStart(2, '0');
const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const stampText = (d) => `${isoDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
const fileSafe = (text) => text.replace(/[^A-Za-z0-9.]+/g, '-').replace(/^-|-$/g, '');

// Resolved at call time so requiring this module never loads puppeteer.
const defaultRenderPdf = (html, options) => require('../lib/pdfRenderer').defaultRenderer().renderPdf(html, options);

const hasFilterQuery = (query) => ['periodId', 'from', 'to'].some((k) => query[k] !== undefined);

async function renderPdf(render, html) {
    try {
        return await render(html, { size: 'letter' });
    } catch (err) {
        if (err.code === 'RENDERER_UNAVAILABLE') throw new ReportError(503, err.message);
        throw err;
    }
}

function createFinanceReportsRouter({ db, renderPdf: render, now = () => new Date() }) {
    const router = express.Router();

    router.get('/:report.:format', async (req, res) => {
        try {
            const { report, format } = req.params;
            if (!Object.hasOwn(REPORTS, report)) throw new ReportError(400, `Unknown report: ${report}`);
            if (!Object.hasOwn(FORMATS, format)) throw new ReportError(400, `Unknown format: ${format}`);
            const spec = REPORTS[report];
            const filter = spec.filterOptional && !hasFilterQuery(req.query) ? null : await parseReportFilter(db, req.query);
            const data = await spec.build(db, { filter, asOf: isoDate(now()) });
            const body = format === 'xlsx'
                ? buildXlsx(reportSheets(report, data))
                : await renderPdf(render, spec.html(data, { generatedAt: stampText(now()) }));
            res.status(200)
                .set('Content-Type', FORMATS[format].type)
                .set('Content-Disposition', `attachment; filename="leemac-${report}-${fileSafe(data.rangeLabel)}.${format}"`)
                .send(body);
        } catch (err) {
            if (err instanceof ReportError) return res.status(err.status).json({ error: err.message });
            console.error(err);
            res.status(500).json({ error: 'Failed to build report' });
        }
    });

    return router;
}

module.exports = createFinanceReportsRouter({ db: sharedDb, renderPdf: defaultRenderPdf });
module.exports.createFinanceReportsRouter = createFinanceReportsRouter;
