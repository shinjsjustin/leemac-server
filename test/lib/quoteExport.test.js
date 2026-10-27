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
    assert.deepEqual(result, { id: 7, type: 'quote', action: 'exportQuote', jobNumber: 7, parts: 1, fileId: null, filename: null });
    assert.ok(s.sheetCalls.includes('getSheet'));
    assert.equal(s.posts.length, 1);
    assert.equal(s.posts[0].url, URL);
    assert.equal(s.posts[0].init.method, 'POST');
    assert.equal(s.posts[0].init.headers['Content-Type'], 'application/json');
    assert.deepEqual(JSON.parse(s.posts[0].init.body), { action: 'exportQuote', jobId: '7', jobNumber: 7 });
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

const MODULE_PATH = require.resolve('../../src/lib/quoteExport');
const ENV_KEYS = ['SHEET_ID', 'SPREADSHEET_ID', 'GOOGLE_CLIENT_EMAIL', 'GOOGLE_SERVICE_PRIVATE_KEY'];

// Runs fn with stubbed Google libs and a freshly required module, then restores cache and env.
async function withStubbedGoogle(sheetsById, fn) {
    const counts = { docs: 0, jwts: 0 };
    class JWT { constructor() { counts.jwts++; } }
    class GoogleSpreadsheet {
        constructor() { counts.docs++; this.sheetsById = sheetsById; }
        async loadInfo() {}
    }
    const ids = ['google-spreadsheet', 'google-auth-library'].map((n) => require.resolve(n));
    const saved = [...ids, MODULE_PATH].map((id) => [id, require.cache[id]]);
    const savedEnv = ENV_KEYS.map((k) => [k, process.env[k]]);
    const stubExports = [{ GoogleSpreadsheet }, { JWT }];
    ids.forEach((id, n) => {
        require.cache[id] = { id, filename: id, loaded: true, exports: stubExports[n] };
    });
    delete require.cache[MODULE_PATH];
    try {
        const mod = require(MODULE_PATH);
        await fn(mod, counts);
    } finally {
        for (const [id, entry] of saved) {
            if (entry) require.cache[id] = entry; else delete require.cache[id];
        }
        for (const [k, v] of savedEnv) {
            if (v === undefined) delete process.env[k]; else process.env[k] = v;
        }
    }
}

test('requiring the module builds no doc; getQuoteSheet builds one and returns the sheet', async () => {
    const stubSheet = { title: 'stub' };
    await withStubbedGoogle({ 'sheet-1': stubSheet }, async (mod, counts) => {
        assert.deepEqual(counts, { docs: 0, jwts: 0 });
        process.env.SHEET_ID = 'sheet-1';
        process.env.SPREADSHEET_ID = 'ss-1';
        const sheet = await mod.getQuoteSheet();
        assert.equal(sheet, stubSheet);
        assert.deepEqual(counts, { docs: 1, jwts: 1 });
    });
});

test('getQuoteSheet throws 503 when the doc has no sheet for SHEET_ID', async () => {
    await withStubbedGoogle({ other: {} }, async (mod) => {
        process.env.SHEET_ID = 'sheet-1';
        const e = await rejection(mod.getQuoteSheet());
        assert.equal(e.name, 'QuoteExportError');
        assert.equal(e.status, 503);
    });
});
