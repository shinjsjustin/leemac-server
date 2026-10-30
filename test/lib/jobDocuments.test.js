const { test } = require('node:test');
const assert = require('node:assert');
const { makeDocument, latestDocuments, getDocument, refillDocument, saveDocument, DocumentError } = require('../../src/lib/jobDocuments');

const job = {
    job_number: 'J42', company_name: 'Acme', address_line1: '1 Main', address_line2: 'Town',
    tax_code: 0, tax: 0, tax_percent: 0, attention: 'Bob',
};

function stubDb({ jobRows = [job], parts = [], files = [], saved = [], next = 8, owner = [] } = {}) {
    const calls = [];
    return {
        calls,
        execute: async (sql, params) => {
            calls.push({ sql, params });
            if (/FROM job_document/.test(sql)) return [saved];
            if (/INSERT INTO job_document/.test(sql)) return [{}];
            if (/UPDATE job\b/.test(sql)) return [{}];
            if (/MAX\(/.test(sql)) return [[{ max_number: next - 1 }]];
            if (/SELECT job_number FROM job/.test(sql)) return [owner];
            if (/FROM job\b/.test(sql) && /JOIN company/.test(sql)) return [jobRows];
            if (/FROM job_part/.test(sql)) return [parts];
            if (/INSERT INTO uploaded_files/.test(sql)) return [{ insertId: 99 }];
            if (/FROM uploaded_files/.test(sql)) return [files];
            throw new Error(`unexpected sql ${sql}`);
        },
    };
}

const now = () => new Date(2026, 0, 2, 3, 4, 5);

test('saves a rendered pdf named Label-jobNumber-stamp-site.pdf and returns its id', async () => {
    const db = stubDb();
    const rendered = [];
    const renderPdf = async (html, opts) => { rendered.push({ html, opts }); return Buffer.from('PDF'); };
    const result = await makeDocument(db, 7, 'shipping', { renderPdf, now });
    assert.deepEqual(result, { type: 'shipping', fileId: 99, filename: 'Shipping-J42-20260102-030405-site.pdf' });
    assert.equal(rendered.length, 1);
    assert.deepEqual(rendered[0].opts, { size: '4x6' });
    assert.match(rendered[0].html, /<html/i);
    const insert = db.calls.find((c) => /INSERT/.test(c.sql));
    assert.deepEqual(insert.params.slice(0, 3), ['Shipping-J42-20260102-030405-site.pdf', 'application/pdf', 3]);
    assert.equal(insert.params[4], 7);
});

test('renders letter size for a quote', async () => {
    let opts;
    await makeDocument(stubDb(), 7, 'quote', { renderPdf: async (h, o) => { opts = o; return Buffer.from('x'); }, now });
    assert.deepEqual(opts, { size: 'letter' });
});

async function rejection(promise) {
    try { await promise; } catch (err) { return err; }
    assert.fail('expected rejection');
}

test('rejects an unknown type with 400 and renders nothing', async () => {
    let called = false;
    const err = await rejection(makeDocument(stubDb(), 7, 'bogus', { renderPdf: async () => { called = true; }, now }));
    assert.ok(err instanceof DocumentError);
    assert.equal(err.status, 400);
    assert.equal(called, false);
});

test('rejects a missing job with 404', async () => {
    const err = await rejection(makeDocument(stubDb({ jobRows: [] }), 7, 'quote', { renderPdf: async () => Buffer.from('x'), now }));
    assert.ok(err instanceof DocumentError);
    assert.equal(err.status, 404);
});

test('maps RENDERER_UNAVAILABLE to 503 with the renderer message and saves nothing', async () => {
    const db = stubDb();
    const renderPdf = async () => { throw Object.assign(new Error('no puppeteer'), { code: 'RENDERER_UNAVAILABLE' }); };
    const err = await rejection(makeDocument(db, 7, 'quote', { renderPdf, now }));
    assert.ok(err instanceof DocumentError);
    assert.equal(err.status, 503);
    assert.equal(err.message, 'no puppeteer');
    assert.equal(db.calls.some((c) => /INSERT/.test(c.sql)), false);
});

test('rethrows other render errors unchanged', async () => {
    const boom = new Error('boom');
    const err = await rejection(makeDocument(stubDb(), 7, 'quote', { renderPdf: async () => { throw boom; }, now }));
    assert.equal(err, boom);
});

test('latestDocuments returns the newest -site.pdf per label or null', async () => {
    // The query orders newest first; the stub returns rows already in that order.
    const files = [
        { id: 2, filename: 'Quote-J42-20260102-000000-site.pdf', uploaded_at: '2026-01-02' },
        { id: 1, filename: 'Quote-J42-20260101-000000-site.pdf', uploaded_at: '2026-01-01' },
        { id: 3, filename: 'Quote-J42-20260103-000000.pdf', uploaded_at: '2026-01-03' },
        { id: 4, filename: 'PackingList-J42-20260102-000000-site.pdf', uploaded_at: '2026-01-02' },
        { id: 5, filename: 'notes-site.pdf', uploaded_at: '2026-01-05' },
    ];
    const db = stubDb({ files });
    const latest = await latestDocuments(db, 7);
    assert.deepEqual(latest, {
        quote: { id: 2, filename: 'Quote-J42-20260102-000000-site.pdf', uploaded_at: '2026-01-02' },
        order: null,
        invoice: null,
        packing: { id: 4, filename: 'PackingList-J42-20260102-000000-site.pdf', uploaded_at: '2026-01-02' },
        shipping: null,
    });
    assert.equal(db.calls[0].params[0], 7);
});

const snapFields = {
    customer: { name: 'Snap Co', line1: 'a', line2: 'b', attention: 'c' }, reference: 'R1',
    dates: { created: '', po: '', due: '', invoice: '', ship: '' }, poNumber: '', invoiceNumber: '',
    tax: { flag: 'N', percent: 0, amount: 0 },
};
const snapParts = [{ number: 'P-1', rev: 'A', description: 'd', details: '', quantity: 2, price: 3 }];
const savedRow = {
    fields: JSON.stringify(snapFields), parts: JSON.stringify(snapParts), file_id: 12,
    saved_at: '2026-01-02 03:04:05', saved_by_name: 'Ann',
};
const pdf = async () => Buffer.from('PDF');

test('getDocument returns the stored snapshot parsed', async () => {
    const doc = await getDocument(stubDb({ saved: [savedRow] }), 7, 'quote');
    assert.deepEqual(doc, {
        type: 'quote', saved: true, savedAt: '2026-01-02 03:04:05', savedBy: 'Ann', fileId: 12,
        fields: snapFields, parts: snapParts,
    });
});

test('getDocument falls back to the job form when nothing is saved', async () => {
    const doc = await getDocument(stubDb({ parts: [{ number: 'P-9', quantity: 1, price: 5 }] }), 7, 'quote');
    assert.equal(doc.saved, false);
    assert.equal(doc.savedAt, null);
    assert.equal(doc.savedBy, null);
    assert.equal(doc.fileId, null);
    assert.equal(doc.fields.customer.name, 'Acme');
    assert.equal(doc.parts[0].number, 'P-9');
});

test('getDocument rejects bad type 400 and missing job 404', async () => {
    assert.equal((await rejection(getDocument(stubDb(), 7, 'bogus'))).status, 400);
    assert.equal((await rejection(getDocument(stubDb({ jobRows: [] }), 7, 'quote'))).status, 404);
});

test('refillDocument returns the job form even when a snapshot exists', async () => {
    const doc = await refillDocument(stubDb({ saved: [savedRow] }), 7, 'quote');
    assert.equal(doc.saved, false);
    assert.equal(doc.fields.customer.name, 'Acme');
});

test('saveDocument renders the form, stores the pdf, upserts and returns the saved document', async () => {
    const db = stubDb({ saved: [savedRow] });
    const rendered = [];
    const renderPdf = async (html, opts) => { rendered.push({ html, opts }); return Buffer.from('PDF'); };
    const doc = await saveDocument(db, 7, 'quote', { fields: snapFields, parts: snapParts }, { name: 'Ann', email: 'a@x' }, { renderPdf, now });
    assert.match(rendered[0].html, /Snap Co/);
    assert.deepEqual(rendered[0].opts, { size: 'letter' });
    const file = db.calls.find((c) => /INSERT INTO uploaded_files/.test(c.sql));
    assert.equal(file.params[0], 'Quote-J42-20260102-030405-site.pdf');
    const up = db.calls.find((c) => /INSERT INTO job_document/.test(c.sql));
    assert.match(up.sql, /ON DUPLICATE KEY UPDATE/);
    assert.equal(up.params.includes(JSON.stringify(snapFields)), true);
    assert.equal(up.params.includes(JSON.stringify(snapParts)), true);
    assert.equal(up.params.includes('Ann'), true);
    assert.equal(up.params.includes(99), true);
    assert.equal(up.params.includes(7), true);
    assert.equal(doc.saved, true);
    assert.equal(doc.type, 'quote');
    assert.equal(db.calls.some((c) => /UPDATE job\b/.test(c.sql)), false);
});

test('saveDocument records the email when the user has no name', async () => {
    const db = stubDb({ saved: [savedRow] });
    await saveDocument(db, 7, 'quote', { fields: snapFields, parts: snapParts }, { email: 'a@x' }, { renderPdf: pdf, now });
    assert.equal(db.calls.find((c) => /INSERT INTO job_document/.test(c.sql)).params.includes('a@x'), true);
});

test('saveDocument maps RENDERER_UNAVAILABLE to 503 and saves nothing', async () => {
    const db = stubDb();
    const renderPdf = async () => { throw Object.assign(new Error('no puppeteer'), { code: 'RENDERER_UNAVAILABLE' }); };
    const err = await rejection(saveDocument(db, 7, 'quote', { fields: snapFields, parts: snapParts }, {}, { renderPdf, now }));
    assert.equal(err.status, 503);
    assert.equal(db.calls.some((c) => /INSERT|UPDATE/.test(c.sql)), false);
});

test('saveDocument rejects bad type 400 and missing job 404', async () => {
    const body = { fields: snapFields, parts: snapParts };
    assert.equal((await rejection(saveDocument(stubDb(), 7, 'bogus', body, {}, { renderPdf: pdf, now }))).status, 400);
    assert.equal((await rejection(saveDocument(stubDb({ jobRows: [] }), 7, 'quote', body, {}, { renderPdf: pdf, now }))).status, 404);
});

const invoiceCases = [
    ['uses fields.invoiceNumber', { invoiceNumber: '55' }, { invoice_number: '9' }, '55'],
    ['falls back to job.invoice_number', { invoiceNumber: '' }, { invoice_number: '9' }, '9'],
    ['falls back to the next number', { invoiceNumber: '' }, { invoice_number: '' }, '8'],
];
for (const [name, patch, jobPatch, expected] of invoiceCases) {
    test(`invoice save ${name}, writes it to the job and fills a null invoice date`, async () => {
        const db = stubDb({ jobRows: [{ ...job, invoice_date: null, ...jobPatch }], saved: [savedRow] });
        let html;
        await saveDocument(db, 7, 'invoice', { fields: { ...snapFields, ...patch }, parts: snapParts }, {}, { renderPdf: async (h) => { html = h; return Buffer.from('x'); }, now });
        const up = db.calls.find((c) => /INSERT INTO job_document/.test(c.sql));
        assert.equal(JSON.parse(up.params.find((p) => typeof p === 'string' && p.startsWith('{"customer"'))).invoiceNumber, expected);
        const upd = db.calls.find((c) => /UPDATE job\b/.test(c.sql));
        assert.deepEqual(upd.params, [expected, '2026-01-02', 7]);
    });
}

test('invoice save returns 409 when another job owns the number, before rendering', async () => {
    const db = stubDb({ owner: [{ job_number: 'J1' }] });
    let called = false;
    const err = await rejection(saveDocument(db, 7, 'invoice', { fields: { ...snapFields, invoiceNumber: '55' }, parts: snapParts }, {}, { renderPdf: async () => { called = true; return Buffer.from('x'); }, now }));
    assert.equal(err.status, 409);
    assert.equal(called, false);
    assert.equal(db.calls.some((c) => /INSERT|UPDATE/.test(c.sql)), false);
});

test('makeDocument renders the saved snapshot when one exists', async () => {
    let html;
    await makeDocument(stubDb({ saved: [savedRow] }), 7, 'quote', { renderPdf: async (h) => { html = h; return Buffer.from('x'); }, now });
    assert.match(html, /Snap Co/);
    assert.doesNotMatch(html, /Acme/);
});

test('invoice save answers 409 when the job write races a duplicate, leaving no file and no snapshot', async () => {
    const db = stubDb({ jobRows: [{ ...job, invoice_date: null }] });
    const execute = db.execute;
    db.execute = async (sql, params) => {
        if (/UPDATE job\b/.test(sql)) {
            db.calls.push({ sql, params });
            throw Object.assign(new Error("Duplicate entry '55' for key 'uq_job_invoice_number'"), { code: 'ER_DUP_ENTRY' });
        }
        return execute(sql, params);
    };
    const err = await rejection(saveDocument(db, 7, 'invoice', { fields: { ...snapFields, invoiceNumber: '55' }, parts: snapParts }, {}, { renderPdf: pdf, now }));
    assert.equal(err.status, 409);
    assert.equal(db.calls.some((c) => /INSERT/.test(c.sql)), false);
});

const badBodies = [
    ['undefined', undefined],
    ['null', null],
    ['no fields', { parts: snapParts }],
    ['array fields', { fields: [], parts: snapParts }],
    ['null fields', { fields: null, parts: snapParts }],
    ['string fields', { fields: 'x', parts: snapParts }],
    ['no parts', { fields: snapFields }],
    ['object parts', { fields: snapFields, parts: {} }],
];
for (const [name, body] of badBodies) {
    test(`saveDocument rejects a body with ${name} as 400 before any query or render`, async () => {
        const db = stubDb();
        let rendered = false;
        const err = await rejection(saveDocument(db, 7, 'quote', body, {}, { renderPdf: async () => { rendered = true; return Buffer.from('x'); }, now }));
        assert.ok(err instanceof DocumentError);
        assert.equal(err.status, 400);
        assert.equal(db.calls.length, 0);
        assert.equal(rendered, false);
    });
}

test('invoice save fills a blank invoice date with today as MM-DD-YYYY in the pdf and snapshot', async () => {
    const db = stubDb({ jobRows: [{ ...job, invoice_date: null }] });
    let data;
    await saveDocument(db, 7, 'invoice', { fields: { ...snapFields, invoiceNumber: '55' }, parts: snapParts }, {}, { renderPdf: async (h) => { data = h; return Buffer.from('x'); }, now });
    assert.match(data, /01-02-2026/);
    const up = db.calls.find((c) => /INSERT INTO job_document/.test(c.sql));
    const saved = JSON.parse(up.params.find((p) => typeof p === 'string' && p.startsWith('{"customer"')));
    assert.equal(saved.dates.invoice, '01-02-2026');
});

test('invoice save keeps a typed invoice date', async () => {
    const db = stubDb({ jobRows: [{ ...job, invoice_date: null }] });
    const fields = { ...snapFields, invoiceNumber: '55', dates: { ...snapFields.dates, invoice: '03-04-2025' } };
    await saveDocument(db, 7, 'invoice', { fields, parts: snapParts }, {}, { renderPdf: pdf, now });
    const up = db.calls.find((c) => /INSERT INTO job_document/.test(c.sql));
    const saved = JSON.parse(up.params.find((p) => typeof p === 'string' && p.startsWith('{"customer"')));
    assert.equal(saved.dates.invoice, '03-04-2025');
});

test('non-invoice save leaves a blank invoice date blank', async () => {
    const db = stubDb();
    await saveDocument(db, 7, 'quote', { fields: snapFields, parts: snapParts }, {}, { renderPdf: pdf, now });
    const up = db.calls.find((c) => /INSERT INTO job_document/.test(c.sql));
    assert.equal(JSON.parse(up.params.find((p) => typeof p === 'string' && p.startsWith('{"customer"'))).dates.invoice, '');
});
