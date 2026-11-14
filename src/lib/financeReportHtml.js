// Black-and-white Letter HTML for the finance PDFs; the renderer adds Page X of Y from the doc-footer meta.
const { escapeHtml, usd, masthead, docPage } = require('./documents/layout');

const CONFIDENTIAL = 'Confidential';

// Overrides docs.css, whose navy accent would print as a tint.
const REPORT_CSS = `<style id="finance-bw">
:root { --accent: #000; --ink: #000; --muted: #444; --rule: #999; }
@page wide { size: Letter landscape; margin: 0.5in 0.5in 0.6in; }
body { color: #000; background: #fff; }
.wide { page: wide; }
table.report { width: 100%; border-collapse: collapse; font-size: 8.5pt; margin: 6pt 0 12pt; }
table.report th, table.report td { padding: 2pt 4pt; border-bottom: 0.5pt solid #999; text-align: left; vertical-align: top; }
table.report th { border-bottom: 1pt solid #000; }
table.report .n { text-align: right; white-space: nowrap; }
table.report tr.part td { color: #444; font-size: 7.5pt; border-bottom: 0; }
table.report tr.sub td, table.report tr.total td { font-weight: 700; border-top: 1pt solid #000; }
h2 { font-size: 11pt; margin: 12pt 0 2pt; }
.meta { font-size: 8.5pt; color: #444; margin: 4pt 0; }
</style>`;

const cell = (value, cls = '') => `<td${cls ? ` class="${cls}"` : ''}>${escapeHtml(value)}</td>`;
const money = (value) => cell(usd(value), 'n');
const head = (cols) => `<thead><tr>${cols.map(([label, cls]) => `<th${cls ? ` class="${cls}"` : ''}>${escapeHtml(label)}</th>`).join('')}</tr></thead>`;
const table = (cols, rows) => `<table class="report">${head(cols)}<tbody>${rows.join('\n')}</tbody></table>`;

const page = (report, generatedAt, body, cls) => docPage(
    report.title,
    `${CONFIDENTIAL} - ${report.title}`,
    `${REPORT_CSS}
${masthead(report.title, 'Range', report.rangeLabel)}
<div class="meta">Generated ${escapeHtml(generatedAt)} &middot; ${CONFIDENTIAL}</div>
${body}`,
    cls,
);

const BUCKET_LABELS = ['0-30', '31-60', '61-90', '90+'];

function receivablesHtml(report, { generatedAt }) {
    const cols = [['Invoice'], ['Job'], ['Date'], ['Days', 'n'], ...BUCKET_LABELS.map((b) => [b, 'n']), ['Total', 'n']];
    const bucketCells = (buckets, only) => BUCKET_LABELS.map((b) => (only === undefined || only === b ? money(buckets[b]) : cell('', 'n'))).join('');
    const sections = report.clients.map((client) => {
        const rows = client.jobs.flatMap((j) => [
            `<tr>${cell(j.invoiceNumber)}${cell(j.jobNumber)}${cell(j.invoiceDate)}${cell(j.days ?? '', 'n')}${bucketCells({ [j.bucket]: j.total }, j.bucket)}${money(j.total)}</tr>`,
            ...j.parts.map((p) => `<tr class="part"><td></td><td colspan="${cols.length - 1}">${escapeHtml(p.number)} ${escapeHtml(p.description)} &times; ${escapeHtml(p.quantity)} @ ${usd(p.price)}</td></tr>`),
        ]);
        rows.push(`<tr class="sub">${cell('Subtotal')}${cell('')}${cell('')}${cell('', 'n')}${bucketCells(client.buckets)}${money(client.total)}</tr>`);
        return `<h2>${escapeHtml(client.name)}</h2>${table(cols, rows)}`;
    }).join('\n');
    const summary = table(
        [['Aging summary'], ...BUCKET_LABELS.map((b) => [b, 'n']), ['Total', 'n']],
        [`<tr class="total">${cell('All clients')}${bucketCells(report.totals.buckets)}${money(report.totals.total)}</tr>`],
    );
    return page(report, generatedAt, `${sections}\n${summary}`, 'letter');
}

function ledgerHtml(report, { generatedAt }) {
    const cols = [['Invoice'], ['Job'], ['Client'], ['Date'], ['Subtotal', 'n'], ['Tax', 'n'], ['Total', 'n'], ['Status'], ['Paid']];
    const rows = report.rows.map((r) => `<tr>${cell(r.invoiceNumber)}${cell(r.jobNumber)}${cell(r.client)}${cell(r.invoiceDate)}${money(r.subtotal)}${money(r.tax)}${money(r.total)}${cell(r.status)}${cell(r.paidDate)}</tr>`);
    rows.push(`<tr class="total">${cell('Totals')}${cell('')}${cell('')}${cell('')}${money(report.totals.subtotal)}${money(report.totals.tax)}${money(report.totals.total)}${cell('')}${cell('')}</tr>`);
    return page(report, generatedAt, table(cols, rows), 'letter wide');
}

function expensesHtml(report, { generatedAt }) {
    const cols = [['Date'], ['Vendor'], ['Description'], ['Category'], ['Amount', 'n'], ['Job'], ['Receipt']];
    const rows = report.rows.map((r) => `<tr>${cell(r.date)}${cell(r.vendor)}${cell(r.description)}${cell(r.category)}${money(r.amount)}${cell(r.jobs)}${cell(r.receipt)}</tr>`);
    rows.push(`<tr class="total">${cell('Total')}${cell('')}${cell('')}${cell('')}${money(report.total)}${cell('')}${cell('')}</tr>`);
    const categories = table(
        [['Category totals'], ['Amount', 'n']],
        report.categories.map((c) => `<tr>${cell(c.category)}${money(c.total)}</tr>`),
    );
    return page(report, generatedAt, `${table(cols, rows)}\n${categories}`, 'letter wide');
}

module.exports = { receivablesHtml, ledgerHtml, expensesHtml };
