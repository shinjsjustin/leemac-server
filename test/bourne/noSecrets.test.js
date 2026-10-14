const { test } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const { start } = require('../helpers/server');
const { makeFakeDb } = require('../helpers/fakeDb');

const KEY = process.env.BOURNE_READ_KEY;
const SECRET_MARKERS = ['PLANTED_PASSWORD', 'PLANTED_ACCESS_TOKEN', 'PLANTED_REFRESH_TOKEN'];
const BLOB_MARKER = 'PLANTED_FILE_CONTENT';
const MARKERS = [...SECRET_MARKERS, BLOB_MARKER];

const planted = {
    password: SECRET_MARKERS[0],
    google_access_token: SECRET_MARKERS[1],
    google_refresh_token: SECRET_MARKERS[2],
};
const withSecrets = (row) => ({ ...row, ...planted });
const withBlob = (row) => ({ ...withSecrets(row), content: BLOB_MARKER });

const JOB = { id: 1, job_number: '101', client: 'Acme', attention: 'Bob', po_number: 'PO1', po_date: '2026-01-01', due_date: '2026-02-01', created_at: '2026-01-01', invoice_number: 'INV1', invoice_status: 'waiting' };
const JOB_DETAIL = { ...JOB, ship_date: null, invoice_date: null, subtotal: '1', tax: '0', tax_percent: '0', total_cost: '1' };
const JOB_PART = { job_part_id: 5, part_id: 7, number: 'P-7', description: 'Widget', quantity: 2, price: '1.00', rev: 'A', details: null, note: null, star_status: 'pending', star_attention: null, nfc_tag_id: null };
const NOTE = { id: 3, content: 'legit note text', status: 'open', created_at: '2026-01-02', author: 'Ann' };
const EXPENSE = { id: 3, description: 'Tooling', vendor: 'Acme Tools', amount: '10.25', expense_date: '2026-02-03', category: 'tools' };
const FILE = { id: 11, filename: 'a.pdf', mimetype: 'application/pdf', size: 10, uploaded_at: '2026-01-03', part_id: 7, note_id: 3 };
const PART = { id: 7, number: 'P-7', description: 'Widget' };
const PART_JOB = { job_id: 1, job_number: '101', client: 'Acme', po_number: 'PO1', po_date: null, due_date: null, created_at: '2026-01-01', invoice_status: 'waiting', job_part_id: 5, quantity: 2, price: '1.00', rev: 'A', details: null, star_status: null };
const PERIOD = { id: 1, label: 'Q1 2026', quarter: 1, year: 2026, start_date: '2026-01-01', end_date: '2026-03-31' };
const PERIOD_JOB = { id: 9, job_number: '109', client: 'Acme', po_number: 'PO1', invoice_number: 'INV1', invoice_date: '2026-02-01', invoice_status: 'waiting', total_cost: '100.50' };
const STARRED = { ...JOB_DETAIL, job_id: 1, ...JOB_PART };

function plantedDb() {
    return makeFakeDb([
        { match: /FROM metadata/, rows: [withSecrets({ metavalue: '"1"' })] },
        { match: /COUNT\(\*\) AS total/, rows: [withSecrets({ total: 1 })] },
        { match: /FROM stars s\s+JOIN/, rows: [withSecrets(STARRED)] },
        { match: /FROM note n/, rows: [withSecrets(NOTE)] },
        { match: /FROM uploaded_files/, rows: [withBlob(FILE)] },
        { match: /FROM job j JOIN company c ON j.company_id = c.id\s+WHERE j.id/, rows: [withSecrets(JOB_DETAIL)] },
        { match: /FROM job j JOIN company c/, rows: [withSecrets(JOB)] },
        { match: /FROM job_part jp\s+JOIN part p/, rows: [withSecrets(JOB_PART)] },
        { match: /FROM expense_job ej JOIN expense e/, rows: [withSecrets(EXPENSE)] },
        { match: /FROM part p WHERE p.id/, rows: [withSecrets(PART)] },
        { match: /FROM part p/, rows: [withSecrets(PART)] },
        { match: /FROM job_part jp\s+JOIN job j/, rows: [withSecrets(PART_JOB)] },
        { match: /FROM financial_period WHERE/, rows: [withSecrets(PERIOD)] },
        { match: /FROM financial_period/, rows: [withSecrets(PERIOD)] },
        { match: /FROM job_period jp\s+JOIN job j/, rows: [withSecrets(PERIOD_JOB)] },
        { match: /FROM expense e\s+WHERE e.id IN/, rows: [withSecrets(EXPENSE)] },
        { match: /FROM job\s+WHERE invoice_number IS NOT NULL/, rows: [withSecrets({ invoice_status: 'waiting', count: 1, total_amount: '1' })] },
        { match: /FROM job_period jp JOIN job ON/, rows: [withSecrets({ period_id: 1, invoice_status: 'waiting', count: 1, total_amount: '1' })] },
        { match: /UNION/, rows: [withSecrets({ period_id: 1, count: 1, total_expenses: '1' })] },
    ]);
}

const PATHS = ['/docs', '/starred', '/jobs', '/jobs/1', '/parts?q=a', '/parts/1', '/finances', '/finances/periods/1'];

test('no route queries secret columns, SELECT *, or file content, and no body leaks a planted marker', async () => {
    const { createBourneRouter } = require('../../src/routes/bourne');
    const db = plantedDb();
    const app = express();
    app.use('/api/bourne', createBourneRouter({ db }));
    const server = await start(app);
    const bodies = {};
    try {
        for (const path of PATHS) {
            const res = await fetch(`${server.baseUrl}/api/bourne${path}`, { headers: { 'X-Bourne-Key': KEY } });
            assert.strictEqual(res.status, 200, path);
            bodies[path] = await res.text();
        }
    } finally { await server.close(); }

    assert.ok(db.calls.length > 0);
    for (const { sql } of db.calls) {
        assert.doesNotMatch(sql, /password|google_access_token|google_refresh_token/i, sql);
        assert.doesNotMatch(sql, /SELECT\s+\*|\*\s+FROM|\w\.\*/i, sql);
        if (/uploaded_files/.test(sql)) assert.doesNotMatch(sql, /\bcontent\b/i, sql);
    }
    for (const [path, body] of Object.entries(bodies)) {
        for (const marker of MARKERS) assert.ok(!body.includes(marker), `${path} leaked ${marker}`);
    }
    assert.ok(bodies['/jobs/1'].includes('legit note text'));
});
