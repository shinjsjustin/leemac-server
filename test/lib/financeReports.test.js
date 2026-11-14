const { test } = require('node:test');
const assert = require('node:assert');
const { DatabaseSync } = require('node:sqlite');
const {
    parseReportFilter, buildReceivables, buildLedger, buildExpenses, ReportError,
} = require('../../src/lib/financeReports');

const SCHEMA = `
CREATE TABLE financial_period (id INTEGER PRIMARY KEY, lable TEXT, start_date TEXT, end_date TEXT);
CREATE TABLE company (id INTEGER PRIMARY KEY, name TEXT);
CREATE TABLE job (id INTEGER PRIMARY KEY, job_number TEXT, company_id INTEGER, invoice_number TEXT,
    invoice_date TEXT, subtotal REAL, tax REAL, total_cost REAL, invoice_status TEXT, paid_date TEXT);
CREATE TABLE job_period (id INTEGER PRIMARY KEY, job_id INTEGER, financial_period_id INTEGER);
CREATE TABLE part (id INTEGER PRIMARY KEY, number TEXT, description TEXT);
CREATE TABLE job_part (id INTEGER PRIMARY KEY, job_id INTEGER, part_id INTEGER, quantity INTEGER, price REAL);
CREATE TABLE expense (id INTEGER PRIMARY KEY, description TEXT, vendor TEXT, amount REAL,
    expense_date TEXT, category TEXT, file_id INTEGER);
CREATE TABLE expense_job (id INTEGER PRIMARY KEY, expense_id INTEGER, job_id INTEGER);
CREATE TABLE expense_financial_period (id INTEGER PRIMARY KEY, expense_id INTEGER, financial_period_id INTEGER);

INSERT INTO financial_period VALUES (7, 'Q3 2026', '2026-07-01', '2026-09-30'), (8, 'Q4 2026', '2026-10-01', '2026-12-31');
INSERT INTO company VALUES (1, 'Acme'), (2, 'Beta');
INSERT INTO part VALUES (1, 'P-1', 'Bracket'), (2, 'P-2', 'Plate');
INSERT INTO job VALUES
 (1, 'J1', 1, 'INV-1', '2026-10-20', 100.10, 8.00, 108.10, 'waiting', NULL),
 (2, 'J2', 1, 'INV-2', '2026-09-01', 200.20, 0, 200.20, 'waiting', NULL),
 (3, 'J3', 2, 'INV-3', '2026-07-01', 50, 4, 54, 'waiting', NULL),
 (4, 'J4', 2, 'INV-4', NULL, 10, 0, 10, 'waiting', NULL),
 (5, 'J5', 1, 'INV-5', '2026-08-05', 300, 0, 300, 'paid', '2026-08-20'),
 (6, 'J6', 1, '  ', '2026-08-06', 5, 0, 5, 'waiting', NULL),
 (7, 'J7', 1, NULL, NULL, 5, 0, 5, 'waiting', NULL),
 (8, 'J8', 2, 'INV-8', '2026-10-01', 40.01, 0, 40.01, 'waiting', NULL);
INSERT INTO job_period (job_id, financial_period_id) VALUES (1, 8), (2, 7), (3, 7), (5, 7), (8, 8);
INSERT INTO job_part (job_id, part_id, quantity, price) VALUES (1, 1, 2, 50.05), (1, 2, 1, 0), (2, 2, 1, 200.20);
INSERT INTO expense VALUES
 (1, 'Steel', 'MetalCo', 100.10, '2026-07-05', 'Material', 9),
 (2, 'Tape', NULL, 20, '2026-08-05', 'Supplies', NULL),
 (3, 'Saw', 'ToolCo', 900, '2026-11-05', 'Material', NULL),
 (4, 'Gas', 'FuelCo', 5.5, '2026-08-09', NULL, NULL);
INSERT INTO expense_job (expense_id, job_id) VALUES (1, 2), (1, 5);
INSERT INTO expense_financial_period (expense_id, financial_period_id) VALUES (1, 7), (2, 7), (3, 8);
`;

function makeDb() {
    const sqlite = new DatabaseSync(':memory:');
    sqlite.exec(SCHEMA);
    return {
        async execute(sql, params = []) {
            return [sqlite.prepare(sql).all(...params).map((r) => ({ ...r }))];
        },
    };
}

test('parseReportFilter accepts a period id and labels it with the period', async () => {
    const f = await parseReportFilter(makeDb(), { periodId: '7' });
    assert.deepStrictEqual(f, { periodId: 7, rangeLabel: 'Q3 2026' });
});

test('parseReportFilter accepts a from/to range', async () => {
    const f = await parseReportFilter(makeDb(), { from: '2026-07-01', to: '2026-08-31' });
    assert.deepStrictEqual(f, { from: '2026-07-01', to: '2026-08-31', rangeLabel: '2026-07-01 to 2026-08-31' });
});

test('parseReportFilter throws 400 for missing, malformed or reversed input', async () => {
    const bad = [{}, { from: '2026-07-01' }, { from: '2026-7-1', to: '2026-08-01' },
        { from: '2026-02-31', to: '2026-03-01' }, { from: '2026-09-01', to: '2026-08-01' },
        { periodId: 'abc' }, { periodId: '7', from: '2026-07-01', to: '2026-08-01' }];
    for (const q of bad) {
        await assert.rejects(parseReportFilter(makeDb(), q),
            (e) => e instanceof ReportError && e.status === 400, JSON.stringify(q));
    }
});

test('parseReportFilter throws 404 for an unknown period', async () => {
    await assert.rejects(parseReportFilter(makeDb(), { periodId: '99' }),
        (e) => e instanceof ReportError && e.status === 404);
});

test('receivables ages invoiced waiting jobs by client with totals', async () => {
    const r = await buildReceivables(makeDb(), { asOf: '2026-11-14' });
    assert.strictEqual(r.title, 'Accounts Receivable');
    assert.strictEqual(r.asOf, '2026-11-14');
    assert.deepStrictEqual(r.clients.map((c) => c.name), ['Acme', 'Beta']);
    const acme = r.clients[0];
    assert.deepStrictEqual(acme.jobs.map((j) => [j.jobNumber, j.invoiceDate, j.days, j.bucket, j.total]),
        [['J1', '2026-10-20', 25, '0-30', 108.1], ['J2', '2026-09-01', 74, '61-90', 200.2]]);
    assert.deepStrictEqual(acme.jobs[0].parts, [
        { number: 'P-1', description: 'Bracket', quantity: 2, price: 50.05 },
        { number: 'P-2', description: 'Plate', quantity: 1, price: 0 },
    ]);
    assert.deepStrictEqual(acme.buckets, { '0-30': 108.1, '31-60': 0, '61-90': 200.2, '90+': 0 });
    assert.strictEqual(acme.total, 308.3);
    const beta = r.clients[1];
    assert.deepStrictEqual(beta.jobs.map((j) => [j.jobNumber, j.bucket]),
        [['J3', '90+'], ['J4', '90+'], ['J8', '31-60']]);
    assert.strictEqual(beta.jobs[1].invoiceDate, '');
    assert.strictEqual(r.totals.total, 412.31);
    assert.deepStrictEqual(r.totals.buckets, { '0-30': 108.1, '31-60': 40.01, '61-90': 200.2, '90+': 64 });
});

test('receivables with a period filter keeps only that period', async () => {
    const db = makeDb();
    const filter = await parseReportFilter(db, { periodId: '8' });
    const r = await buildReceivables(db, { filter, asOf: '2026-11-14' });
    assert.deepStrictEqual(r.clients.flatMap((c) => c.jobs.map((j) => j.jobNumber)), ['J1', 'J8']);
    assert.strictEqual(r.rangeLabel, 'Q4 2026');
});

test('ledger lists invoiced jobs in a period with totals', async () => {
    const db = makeDb();
    const filter = await parseReportFilter(db, { periodId: '7' });
    const l = await buildLedger(db, { filter });
    assert.deepStrictEqual(l.rows.map((r) => r.invoiceNumber), ['INV-3', 'INV-5', 'INV-2']);
    assert.deepStrictEqual(l.totals, { subtotal: 550.2, tax: 4, total: 554.2 });
    assert.strictEqual(l.rows[1].client, 'Acme');
    assert.strictEqual(l.rows[1].paidDate, '2026-08-20');
});

test('ledger by invoice_date range excludes blank invoices and null dates', async () => {
    const db = makeDb();
    const filter = await parseReportFilter(db, { from: '2026-08-01', to: '2026-10-31' });
    const l = await buildLedger(db, { filter });
    assert.deepStrictEqual(l.rows.map((r) => r.invoiceNumber), ['INV-5', 'INV-2', 'INV-8', 'INV-1']);
    assert.strictEqual(l.rangeLabel, '2026-08-01 to 2026-10-31');
});

test('expenses in a period count a job-linked and period-linked expense once', async () => {
    const db = makeDb();
    const filter = await parseReportFilter(db, { periodId: '7' });
    const e = await buildExpenses(db, { filter });
    assert.deepStrictEqual(e.rows.map((r) => [r.id, r.amount, r.receipt, r.jobs]), [
        [1, 100.1, 'yes', 'J2, J5'],
        [2, 20, 'no', ''],
    ]);
    assert.deepStrictEqual(e.categories, [
        { category: 'Material', total: 100.1 }, { category: 'Supplies', total: 20 }]);
    assert.strictEqual(e.total, 120.1);
});

test('expenses by date range use expense_date and bucket missing category', async () => {
    const db = makeDb();
    const filter = await parseReportFilter(db, { from: '2026-08-01', to: '2026-08-31' });
    const e = await buildExpenses(db, { filter });
    assert.deepStrictEqual(e.rows.map((r) => r.id), [2, 4]);
    assert.deepStrictEqual(e.categories, [
        { category: 'Supplies', total: 20 }, { category: 'Uncategorized', total: 5.5 }]);
    assert.strictEqual(e.total, 25.5);
});

test('Date values from mysql2 read as YYYY-MM-DD', async () => {
    const db = {
        async execute(sql) {
            if (sql.includes('FROM job_part')) return [[]];
            return [[{ id: 1, job_number: 'J', company_name: 'Z', invoice_number: 'I',
                invoice_date: new Date('2026-10-20T00:00:00Z'), subtotal: '1.00', tax: '0.00',
                total_cost: '1.00', invoice_status: 'paid', paid_date: new Date('2026-10-25T00:00:00Z') }]];
        },
    };
    const l = await buildLedger(db, { filter: { from: '2026-10-01', to: '2026-10-31', rangeLabel: 'x' } });
    assert.strictEqual(l.rows[0].invoiceDate, '2026-10-20');
    assert.strictEqual(l.rows[0].paidDate, '2026-10-25');
});
