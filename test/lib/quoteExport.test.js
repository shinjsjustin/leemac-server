const test = require('node:test');
const assert = require('node:assert/strict');
const { makeFakeDb } = require('../helpers/fakeDb');
const { exportQuote, QuoteExportError } = require('../../src/lib/quoteExport');

const job = {
    job_number: 7, company_code: 'AC', company_name: 'Acme', address_line1: 'a',
    address_line2: 'b', attention: 'Bob', created_at: '2024-03-05T12:00:00',
    due_date: '2024-04-01T12:00:00', tax_code: 0,
};
const parts = [{ number: 'P-1', quantity: 2, price: 5 }];
const URL = 'https://script.example/exec';

function setup({ withJob = true, ok = true } = {}) {
    const db = makeFakeDb([
        { match: /FROM job\s+JOIN company/, rows: withJob ? [job] : [] },
        { match: /FROM job_part/, rows: parts },
    ]);
    const sheetCalls = [];
    const sheet = {
        async clear() {},
        async loadCells() {},
        getCell: () => ({}),
        async saveUpdatedCells() { sheetCalls.push('save'); },
        async getCellsInRange() { return []; },
        async batchUpdate() {},
    };
    const posts = [];
    const getSheet = async () => { sheetCalls.push('getSheet'); return sheet; };
    const post = async (url, init) => { posts.push({ url, init }); return { ok, status: ok ? 200 : 500 }; };
    return { db, getSheet, post, posts, sheetCalls };
}

async function rejection(promise) {
    try { await promise; } catch (e) { return e; }
    assert.fail('expected rejection');
}

test('populates the sheet then posts exportQuote and returns id, action, part count', async () => {
    const s = setup();
    const result = await exportQuote(s.db, 7, { getSheet: s.getSheet, post: s.post, scriptUrl: URL });
    assert.deepEqual(result, { id: 7, action: 'exportQuote', parts: 1 });
    assert.ok(s.sheetCalls.includes('getSheet'));
    assert.equal(s.posts.length, 1);
    assert.equal(s.posts[0].url, URL);
    assert.equal(s.posts[0].init.method, 'POST');
    assert.equal(s.posts[0].init.headers['Content-Type'], 'application/json');
    assert.deepEqual(JSON.parse(s.posts[0].init.body), { action: 'exportQuote' });
});

test('throws 503 when scriptUrl is unset, without posting', async () => {
    const s = setup();
    const e = await rejection(exportQuote(s.db, 7, { getSheet: s.getSheet, post: s.post, scriptUrl: '' }));
    assert.ok(e instanceof QuoteExportError);
    assert.equal(e.status, 503);
    assert.equal(s.posts.length, 0);
});

test('throws 404 for an unknown job, without posting', async () => {
    const s = setup({ withJob: false });
    const e = await rejection(exportQuote(s.db, 7, { getSheet: s.getSheet, post: s.post, scriptUrl: URL }));
    assert.ok(e instanceof QuoteExportError);
    assert.equal(e.status, 404);
    assert.equal(s.posts.length, 0);
    assert.equal(s.sheetCalls.length, 0);
});

test('throws 502 when the script response is not ok', async () => {
    const s = setup({ ok: false });
    const e = await rejection(exportQuote(s.db, 7, { getSheet: s.getSheet, post: s.post, scriptUrl: URL }));
    assert.ok(e instanceof QuoteExportError);
    assert.equal(e.status, 502);
    assert.equal(s.posts.length, 1);
});

test('requiring the module does not build the Google doc', () => {
    const { getQuoteSheet } = require('../../src/lib/quoteExport');
    assert.equal(typeof getQuoteSheet, 'function');
});
