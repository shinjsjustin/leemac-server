const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { DatabaseSync } = require('node:sqlite');
const { start } = require('../helpers/server');
const { makeShopDb } = require('../helpers/shopSqliteDb');
const { createFinanceReportsRouter } = require('../../src/routes/financeReports');

// The invoices router takes the shared db module, so stub it before loading.
const shopDb = makeShopDb();
const dbPath = require.resolve('../../src/db/db.js');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: shopDb };
const invoicesRouter = require('../../src/routes/invoices');

const contracts = require('../../src/client/src/api/contracts/financeApi.json');

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
INSERT INTO job VALUES (1, 'J1', 1, 'INV-1', '2026-10-20', 100.10, 8.00, 108.10, 'waiting', NULL);
INSERT INTO job_period (job_id, financial_period_id) VALUES (1, 7);
INSERT INTO expense VALUES (1, 'Saw', 'ToolCo', 900, '2026-11-05', 'Material', NULL);
INSERT INTO expense_financial_period (expense_id, financial_period_id) VALUES (1, 7);
`;

function makeReportsDb() {
    const sqlite = new DatabaseSync(':memory:');
    sqlite.exec(SCHEMA);
    return {
        async execute(sql, params = []) {
            return [sqlite.prepare(sql).all(...params).map((r) => ({ ...r }))];
        },
    };
}

function resetInvoices() {
    shopDb.sqlite.exec(`
        DELETE FROM job; DELETE FROM company;
        INSERT INTO company (id, name) VALUES (10, 'Acme');
        INSERT INTO job (id, company_id, invoice_number, invoice_status) VALUES (12, 10, 'INV-12', 'paid');
    `);
}


for (const [name, { method, path, body }] of Object.entries(contracts)) {
    test(`${name} ${method} ${path} answers 2xx`, async () => {
        resetInvoices();
        const app = express();
        app.use(express.json());
        app.use('/internal/finances/reports', createFinanceReportsRouter({
            db: makeReportsDb(),
            renderPdf: async () => Buffer.from('%PDF-fake'),
            now: () => new Date(2026, 10, 14),
        }));
        app.use('/internal/invoices', invoicesRouter);
        const server = await start(app);
        try {
            const res = await fetch(`${server.baseUrl}${path}`, {
                method,
                headers: body ? { 'Content-Type': 'application/json' } : {},
                body: body ? JSON.stringify(body) : undefined,
            });
            assert.ok(res.status >= 200 && res.status < 300, `got ${res.status}`);
        } finally {
            await server.close();
        }
    });
}
