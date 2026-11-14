const { test } = require('node:test');
const assert = require('node:assert');
const zlib = require('node:zlib');
const express = require('express');
const { DatabaseSync } = require('node:sqlite');
const { start } = require('../helpers/server');
const { createFinanceReportsRouter } = require('../../src/routes/financeReports');

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
INSERT INTO financial_period VALUES (7, 'Q4 2026', '2026-10-01', '2026-12-31');
INSERT INTO company VALUES (1, 'Acme');
INSERT INTO job VALUES
 (1, 'J1', 1, 'INV-1', '2026-10-20', 100.10, 8.00, 108.10, 'waiting', NULL),
 (2, 'J2', 1, 'INV-2', '2026-11-01', 40.01, 0, 40.01, 'waiting', NULL);
INSERT INTO job_period (job_id, financial_period_id) VALUES (1, 7), (2, 7);
INSERT INTO expense VALUES (1, 'Saw', 'ToolCo', 900, '2026-11-05', 'Material', NULL);
INSERT INTO expense_financial_period (expense_id, financial_period_id) VALUES (1, 7);
`;

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const FIXED_NOW = new Date(2026, 10, 14, 9, 30, 0);

function makeDb() {
    const sqlite = new DatabaseSync(':memory:');
    sqlite.exec(SCHEMA);
    return {
        async execute(sql, params = []) {
            return [sqlite.prepare(sql).all(...params).map((r) => ({ ...r }))];
        },
    };
}

function readZip(buf) {
    const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    const count = buf.readUInt16LE(eocd + 10);
    let p = buf.readUInt32LE(eocd + 16);
    const entries = {};
    for (let i = 0; i < count; i++) {
        const csize = buf.readUInt32LE(p + 20);
        const nlen = buf.readUInt16LE(p + 28);
        const elen = buf.readUInt16LE(p + 30);
        const clen = buf.readUInt16LE(p + 32);
        const lho = buf.readUInt32LE(p + 42);
        const start = lho + 30 + buf.readUInt16LE(lho + 26) + buf.readUInt16LE(lho + 28);
        entries[buf.toString('utf8', p + 46, p + 46 + nlen)] =
            zlib.inflateRawSync(buf.subarray(start, start + csize)).toString('utf8');
        p += 46 + nlen + elen + clen;
    }
    return entries;
}

// Value of the last numeric cell in the given column, which is the totals row.
function lastNumberIn(sheetXml, column) {
    const cells = [...sheetXml.matchAll(new RegExp(`<c r="${column}\\d+"[^>]*><v>([^<]*)</v></c>`, 'g'))];
    return cells[cells.length - 1][1];
}

async function fetchReport(path, { renderPdf } = {}) {
    const captured = [];
    const fakeRender = renderPdf || (async (html, options) => {
        captured.push({ html, options });
        return Buffer.from('%PDF-fake');
    });
    const app = express();
    app.use('/r', createFinanceReportsRouter({ db: makeDb(), renderPdf: fakeRender, now: () => FIXED_NOW }));
    const server = await start(app);
    const origErr = console.error; console.error = () => {};
    try {
        const res = await fetch(`${server.baseUrl}/r${path}`);
        return { res, body: Buffer.from(await res.arrayBuffer()), captured };
    } finally { console.error = origErr; await server.close(); }
}

const json = ({ body }) => JSON.parse(body.toString());

test('ledger pdf by periodId is an attachment and renders Letter HTML', async () => {
    const { res, body, captured } = await fetchReport('/ledger.pdf?periodId=7');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get('content-type'), 'application/pdf');
    assert.strictEqual(res.headers.get('content-disposition'), 'attachment; filename="leemac-ledger-Q4-2026.pdf"');
    assert.strictEqual(body.toString(), '%PDF-fake');
    assert.strictEqual(captured.length, 1);
    assert.deepStrictEqual(captured[0].options, { size: 'letter' });
    assert.match(captured[0].html, /INV-1/);
});

test('ledger xlsx total equals the total in the PDF HTML', async () => {
    const xlsx = await fetchReport('/ledger.xlsx?periodId=7');
    assert.strictEqual(xlsx.res.status, 200);
    assert.strictEqual(xlsx.res.headers.get('content-type'), XLSX_TYPE);
    assert.strictEqual(xlsx.res.headers.get('content-disposition'), 'attachment; filename="leemac-ledger-Q4-2026.xlsx"');
    const total = lastNumberIn(readZip(xlsx.body)['xl/worksheets/sheet1.xml'], 'G');
    assert.strictEqual(total, '148.11');
    const pdf = await fetchReport('/ledger.pdf?periodId=7');
    assert.ok(pdf.captured[0].html.includes('$148.11'));
});

test('expenses by date range names the file after the range and totals match', async () => {
    const query = '?from=2026-10-01&to=2026-12-31';
    const xlsx = await fetchReport(`/expenses.xlsx${query}`);
    assert.strictEqual(xlsx.res.status, 200);
    assert.strictEqual(xlsx.res.headers.get('content-disposition'),
        'attachment; filename="leemac-expenses-2026-10-01-to-2026-12-31.xlsx"');
    assert.strictEqual(lastNumberIn(readZip(xlsx.body)['xl/worksheets/sheet1.xml'], 'E'), '900');
    const pdf = await fetchReport(`/expenses.pdf${query}`);
    assert.ok(pdf.captured[0].html.includes('$900.00'));
});

test('receivables xlsx has Summary and Lines sheets and its total matches the PDF HTML', async () => {
    const xlsx = await fetchReport('/receivables.xlsx?periodId=7');
    assert.strictEqual(xlsx.res.status, 200);
    const zip = readZip(xlsx.body);
    assert.match(zip['xl/workbook.xml'], /name="Summary"[\s\S]*name="Lines"/);
    assert.strictEqual(lastNumberIn(zip['xl/worksheets/sheet1.xml'], 'F'), '148.11');
    const pdf = await fetchReport('/receivables.pdf?periodId=7');
    assert.strictEqual(pdf.res.status, 200);
    assert.ok(pdf.captured[0].html.includes('$148.11'));
    assert.ok(pdf.captured[0].html.includes('2026-11-14'), 'ages as of the injected clock');
});

test('receivables without a filter covers all waiting invoices', async () => {
    const { res } = await fetchReport('/receivables.pdf');
    assert.strictEqual(res.status, 200);
});

const errorCases = [
    ['unknown report', '/payroll.pdf?periodId=7', 400],
    ['unknown format', '/ledger.csv?periodId=7', 400],
    ['non-numeric periodId', '/ledger.pdf?periodId=abc', 400],
    ['periodId together with a range', '/ledger.pdf?periodId=7&from=2026-10-01&to=2026-12-31', 400],
    ['half a range', '/expenses.xlsx?from=2026-10-01', 400],
    ['ledger with no filter', '/ledger.pdf', 400],
    ['unknown period', '/ledger.pdf?periodId=99', 404],
];
for (const [name, path, status] of errorCases) {
    test(`answers ${status} for ${name}`, async () => {
        const result = await fetchReport(path);
        assert.strictEqual(result.res.status, status);
        assert.ok(json(result).error);
        assert.strictEqual(result.captured.length, 0);
    });
}

test('answers 503 when the renderer is unavailable', async () => {
    const renderPdf = async () => {
        throw Object.assign(new Error('PDF renderer unavailable'), { code: 'RENDERER_UNAVAILABLE' });
    };
    const result = await fetchReport('/ledger.pdf?periodId=7', { renderPdf });
    assert.strictEqual(result.res.status, 503);
    assert.deepStrictEqual(json(result), { error: 'PDF renderer unavailable' });
});

test('an unavailable renderer does not stop xlsx downloads', async () => {
    const renderPdf = async () => { throw Object.assign(new Error('x'), { code: 'RENDERER_UNAVAILABLE' }); };
    const { res } = await fetchReport('/ledger.xlsx?periodId=7', { renderPdf });
    assert.strictEqual(res.status, 200);
});

test('answers 500 on an unexpected renderer failure', async () => {
    const result = await fetchReport('/ledger.pdf?periodId=7', { renderPdf: async () => { throw new Error('boom'); } });
    assert.strictEqual(result.res.status, 500);
});
