const test = require('node:test');
const assert = require('node:assert/strict');
const { receivablesHtml, ledgerHtml, expensesHtml } = require('../../src/lib/financeReportHtml');

const GENERATED_AT = 'Nov 14, 2026 9:30 AM';

const receivables = {
    title: 'Accounts Receivable', rangeLabel: 'Q4 2026', asOf: '2026-11-14',
    clients: [{
        name: '<b>', total: 1500.5,
        buckets: { '0-30': 1000.5, '31-60': 500, '61-90': 0, '90+': 0 },
        jobs: [{ jobNumber: 'J-1', invoiceNumber: 'INV-9', invoiceDate: '2026-10-20', days: 25,
            bucket: '0-30', total: 1000.5, parts: [{ number: 'P-<1>', description: 'Bracket', quantity: 4, price: 250.125 }] },
        { jobNumber: 'J-2', invoiceNumber: 'INV-10', invoiceDate: '2026-09-20', days: 55,
            bucket: '31-60', total: 500, parts: [] }],
    }],
    totals: { buckets: { '0-30': 1000.5, '31-60': 500, '61-90': 0, '90+': 0 }, total: 1500.5 },
};

const ledger = {
    title: 'Invoice Ledger', rangeLabel: '2026-10-01 to 2026-12-31',
    rows: [{ jobNumber: 'J-1', client: '<b>', invoiceNumber: 'INV-9', invoiceDate: '2026-10-20',
        subtotal: 1000, tax: 80, total: 1080, status: 'paid', paidDate: '2026-11-01' }],
    totals: { subtotal: 1000, tax: 80, total: 1080 },
};

const expenses = {
    title: 'Expenses', rangeLabel: 'Q4 2026',
    rows: [{ id: 1, date: '2026-10-05', vendor: '<b>', description: 'Steel & bar', category: 'Materials',
        amount: 2345.6, jobs: 'J-1, J-2', receipt: 'yes' }],
    categories: [{ category: 'Materials', total: 2345.6 }],
    total: 2345.6,
};

const CASES = [
    ['receivablesHtml', receivablesHtml, receivables, 'Accounts Receivable', '$1,500.50'],
    ['ledgerHtml', ledgerHtml, ledger, 'Invoice Ledger', '$1,080.00'],
    ['expensesHtml', expensesHtml, expenses, 'Expenses', '$2,345.60'],
];

for (const [name, render, report, reportName, grand] of CASES) {
    test(`${name} has masthead, range, generated time and Confidential`, () => {
        const html = render(report, { generatedAt: GENERATED_AT });
        assert.match(html, /<header class="masthead">/);
        assert.ok(html.includes('Leemac'));
        assert.ok(html.includes(reportName));
        assert.ok(html.includes(report.rangeLabel));
        assert.ok(html.includes(`Generated ${GENERATED_AT}`));
        assert.ok(html.includes('Confidential'));
    });

    test(`${name} sets the doc-footer meta with Confidential and the report name`, () => {
        const html = render(report, { generatedAt: GENERATED_AT });
        assert.ok(html.includes(`<meta name="doc-footer" content="Confidential - ${reportName}">`));
    });

    test(`${name} prints the grand total with usd`, () => {
        const html = render(report, { generatedAt: GENERATED_AT });
        assert.ok(html.includes(grand));
    });

    test(`${name} escapes values`, () => {
        const html = render(report, { generatedAt: GENERATED_AT });
        assert.ok(!html.includes('<b>'));
        assert.ok(html.includes('&lt;b&gt;'));
    });

    test(`${name} forces black-and-white with only greys`, () => {
        const html = render(report, { generatedAt: GENERATED_AT });
        const css = /<style id="finance-bw">([\s\S]*?)<\/style>/.exec(html)[1];
        assert.match(css, /--accent:\s*#000/);
        const colors = css.match(/#[0-9a-fA-F]{3,6}\b/g) || [];
        assert.ok(colors.length > 0);
        for (const c of colors) {
            const hex = c.length === 4 ? c.slice(1).replace(/./g, '$&$&') : c.slice(1);
            assert.equal(hex.slice(0, 2), hex.slice(2, 4), c);
            assert.equal(hex.slice(2, 4), hex.slice(4, 6), c);
        }
        assert.doesNotMatch(css, /rgb|hsl/i);
    });
}

test('receivablesHtml shows invoices, part lines, aging columns and summary', () => {
    const html = receivablesHtml(receivables, { generatedAt: GENERATED_AT });
    for (const s of ['INV-9', 'INV-10', 'P-&lt;1&gt;', 'Bracket', '0-30', '31-60', '61-90', '90+',
        '$1,000.50', '$500.00', 'Aging summary']) {
        assert.ok(html.includes(s), s);
    }
});

test('ledgerHtml shows a row per invoice and a totals row', () => {
    const html = ledgerHtml(ledger, { generatedAt: GENERATED_AT });
    for (const s of ['INV-9', '$1,000.00', '$80.00', '$1,080.00', 'paid', 'Totals']) {
        assert.ok(html.includes(s), s);
    }
});

test('expensesHtml shows columns and category totals', () => {
    const html = expensesHtml(expenses, { generatedAt: GENERATED_AT });
    for (const s of ['2026-10-05', 'Steel &amp; bar', 'Materials', '$2,345.60', 'J-1, J-2', 'yes', 'Category totals']) {
        assert.ok(html.includes(s), s);
    }
});
