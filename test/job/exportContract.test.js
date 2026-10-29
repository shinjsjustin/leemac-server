const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { start } = require('../helpers/server');
const { makeFakeTxDb } = require('../helpers/fakeTxDb');

const dbPath = require.resolve('../../src/db/db.js');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { execute: async () => [[]] } };

const contracts = require('../../src/client/src/api/contracts/jobExport.json');
const quoteExport = require('../../src/lib/quoteExport');
const { createExportQueue } = require('../../src/lib/exportQueue');
const { createJobExportRouter } = require('../../src/routes/job/export');

const URL = 'https://script.example/exec';
const NOW = new Date(2024, 2, 5, 9, 7, 3);
const pdf = Buffer.from('%PDF-1.4 hello').toString('base64');
const baseJob = {
    company_code: 'AC', company_name: 'Acme', address_line1: 'a', address_line2: 'b',
    attention: 'Bob', created_at: '2024-03-05T12:00:00', due_date: '2024-04-01T12:00:00', tax_code: 0,
};

function setup() {
    let nextFileId = 900;
    const db = makeFakeTxDb([
        { match: /FROM job\s+JOIN company/, rows: (p) => [{ ...baseJob, job_number: p[0] * 100 }] },
        { match: /FROM job_part/, rows: [{ number: 'P-1', quantity: 2, price: 5 }] },
        { match: /INSERT INTO uploaded_files/, rows: () => ({ insertId: nextFileId++ }) },
    ]);
    const posts = [];
    const opts = {
        getSheet: async () => ({
            async clear() {}, async loadCells() {}, getCell: () => ({}),
            async saveUpdatedCells() {}, async getCellsInRange() { return []; }, async batchUpdate() {},
        }),
        post: async (url, init) => {
            posts.push(JSON.parse(init.body));
            const reply = { ok: true, jobNumber: JSON.parse(init.body).jobNumber, pdfBase64: pdf };
            return { ok: true, status: 200, text: async () => JSON.stringify(reply) };
        },
        scriptUrl: URL,
        now: () => NOW,
        log: { warn() {} },
        queue: createExportQueue(),
    };
    return { db, opts, posts };
}

async function postExport({ body, path }) {
    const { db, opts, posts } = setup();
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => { req.user = { role: 'admin', access: 3 }; next(); });
    app.use('/', createJobExportRouter({ db, exportJobs: (d, id, types) => quoteExport.exportJobs(d, id, types, opts) }));
    const { baseUrl, close } = await start(app);
    try {
        const res = await fetch(`${baseUrl}${path.replace('/internal/job', '')}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        });
        return { status: res.status, posts: posts.map((p) => p.action) };
    } finally {
        await close();
    }
}

const ACTIONS = {
    quote: ['exportQuote'],
    order: ['exportOrder'],
    'invoice,packing,shipping': ['exportInvoice', 'exportPackList', 'exportShipping'],
};

for (const entry of contracts.runJobExport) {
    const actions = ACTIONS[entry.body.types.join(',')];
    test(`${entry.body.types.join(' + ')} export answers 200 and posts ${actions.join(', ')}`, async () => {
        const res = await postExport(entry);
        assert.deepEqual(res, { status: 200, posts: actions });
    });
}
