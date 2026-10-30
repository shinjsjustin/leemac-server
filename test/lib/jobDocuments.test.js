const { test } = require('node:test');
const assert = require('node:assert');
const { makeDocument, latestDocuments, DocumentError } = require('../../src/lib/jobDocuments');

const job = {
    job_number: 'J42', company_name: 'Acme', address_line1: '1 Main', address_line2: 'Town',
    tax_code: 0, tax: 0, tax_percent: 0, attention: 'Bob',
};

function stubDb({ jobRows = [job], parts = [], files = [] } = {}) {
    const calls = [];
    return {
        calls,
        execute: async (sql, params) => {
            calls.push({ sql, params });
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
