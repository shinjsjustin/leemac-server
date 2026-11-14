// Turns a finance report from financeReports.js into sheets for buildXlsx; totals are copied, not recomputed.
const BUCKETS = ['0-30', '31-60', '61-90', '90+'];

function receivablesSheets(report) {
    const summaryRows = report.clients.map((c) => [c.name, ...BUCKETS.map((b) => c.buckets[b]), c.total]);
    summaryRows.push(['All clients', ...BUCKETS.map((b) => report.totals.buckets[b]), report.totals.total]);
    const lineRows = report.clients.flatMap((c) => c.jobs.map((j) =>
        [c.name, j.invoiceNumber, j.jobNumber, j.invoiceDate, j.days, j.bucket, j.total]));
    return [
        { name: 'Summary', columns: ['Client', ...BUCKETS, 'Total'], rows: summaryRows },
        { name: 'Lines', columns: ['Client', 'Invoice', 'Job', 'Date', 'Days', 'Bucket', 'Total'], rows: lineRows },
    ];
}

function ledgerSheets(report) {
    const rows = report.rows.map((r) => [r.invoiceNumber, r.jobNumber, r.client, r.invoiceDate,
        r.subtotal, r.tax, r.total, r.status, r.paidDate]);
    const { subtotal, tax, total } = report.totals;
    rows.push(['Totals', '', '', '', subtotal, tax, total, '', '']);
    return [{ name: 'Ledger',
        columns: ['Invoice', 'Job', 'Client', 'Date', 'Subtotal', 'Tax', 'Total', 'Status', 'Paid'], rows }];
}

function expensesSheets(report) {
    const rows = report.rows.map((r) => [r.date, r.vendor, r.description, r.category, r.amount, r.jobs, r.receipt]);
    rows.push(['Total', '', '', '', report.total, '', '']);
    return [{ name: 'Expenses',
        columns: ['Date', 'Vendor', 'Description', 'Category', 'Amount', 'Job', 'Receipt'], rows }];
}

const BUILDERS = { receivables: receivablesSheets, ledger: ledgerSheets, expenses: expensesSheets };

const reportSheets = (name, report) => BUILDERS[name](report);

module.exports = { reportSheets };
