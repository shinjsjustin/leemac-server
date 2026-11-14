const { test } = require('node:test');
const assert = require('node:assert');
const { reportSheets } = require('../../src/lib/financeReportXlsx');

const receivables = {
    title: 'Accounts Receivable', rangeLabel: 'Q4 2026', asOf: '2026-11-14',
    clients: [
        { name: 'Acme', buckets: { '0-30': 108.1, '31-60': 0, '61-90': 200.2, '90+': 0 }, total: 308.3,
            jobs: [
                { jobNumber: 'J1', invoiceNumber: 'INV-1', invoiceDate: '2026-10-20', days: 25, bucket: '0-30', total: 108.1, parts: [] },
                { jobNumber: 'J2', invoiceNumber: 'INV-2', invoiceDate: '2026-09-01', days: 74, bucket: '61-90', total: 200.2, parts: [] },
            ] },
        { name: 'Beta', buckets: { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 10 }, total: 10,
            jobs: [{ jobNumber: 'J4', invoiceNumber: 'INV-4', invoiceDate: '', days: null, bucket: '90+', total: 10, parts: [] }] },
    ],
    totals: { buckets: { '0-30': 108.1, '31-60': 0, '61-90': 200.2, '90+': 10 }, total: 318.3 },
};

const ledger = {
    title: 'Invoice Ledger', rangeLabel: 'Q4 2026',
    rows: [{ jobNumber: 'J1', client: 'Acme', invoiceNumber: 'INV-1', invoiceDate: '2026-10-20',
        subtotal: 100.1, tax: 8, total: 108.1, status: 'waiting', paidDate: '' }],
    totals: { subtotal: 100.1, tax: 8, total: 108.1 },
};

const expenses = {
    title: 'Expenses', rangeLabel: 'Q4 2026',
    rows: [{ id: 1, date: '2026-07-05', vendor: 'MetalCo', description: 'Steel', category: 'Material',
        amount: 100.1, jobs: 'J2, J5', receipt: 'yes' }],
    categories: [{ category: 'Material', total: 100.1 }], total: 100.1,
};

test('receivables has Summary and Lines sheets with the aging totals row', () => {
    const [summary, lines] = reportSheets('receivables', receivables);
    assert.strictEqual(summary.name, 'Summary');
    assert.deepStrictEqual(summary.columns, ['Client', '0-30', '31-60', '61-90', '90+', 'Total']);
    assert.deepStrictEqual(summary.rows, [
        ['Acme', 108.1, 0, 200.2, 0, 308.3],
        ['Beta', 0, 0, 0, 10, 10],
        ['All clients', 108.1, 0, 200.2, 10, 318.3],
    ]);
    assert.strictEqual(lines.name, 'Lines');
    assert.deepStrictEqual(lines.columns, ['Client', 'Invoice', 'Job', 'Date', 'Days', 'Bucket', 'Total']);
    assert.deepStrictEqual(lines.rows, [
        ['Acme', 'INV-1', 'J1', '2026-10-20', 25, '0-30', 108.1],
        ['Acme', 'INV-2', 'J2', '2026-09-01', 74, '61-90', 200.2],
        ['Beta', 'INV-4', 'J4', '', null, '90+', 10],
    ]);
});

test('ledger is one flat sheet ending in a totals row', () => {
    const sheets = reportSheets('ledger', ledger);
    assert.strictEqual(sheets.length, 1);
    assert.strictEqual(sheets[0].name, 'Ledger');
    assert.deepStrictEqual(sheets[0].columns,
        ['Invoice', 'Job', 'Client', 'Date', 'Subtotal', 'Tax', 'Total', 'Status', 'Paid']);
    assert.deepStrictEqual(sheets[0].rows, [
        ['INV-1', 'J1', 'Acme', '2026-10-20', 100.1, 8, 108.1, 'waiting', ''],
        ['Totals', '', '', '', 100.1, 8, 108.1, '', ''],
    ]);
});

test('expenses is one flat sheet ending in a total row', () => {
    const sheets = reportSheets('expenses', expenses);
    assert.strictEqual(sheets.length, 1);
    assert.strictEqual(sheets[0].name, 'Expenses');
    assert.deepStrictEqual(sheets[0].columns,
        ['Date', 'Vendor', 'Description', 'Category', 'Amount', 'Job', 'Receipt']);
    assert.deepStrictEqual(sheets[0].rows, [
        ['2026-07-05', 'MetalCo', 'Steel', 'Material', 100.1, 'J2, J5', 'yes'],
        ['Total', '', '', '', 100.1, '', ''],
    ]);
});
