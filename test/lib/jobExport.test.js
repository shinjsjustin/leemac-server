const test = require('node:test');
const assert = require('node:assert/strict');
const { makeFakeTxDb } = require('../helpers/fakeTxDb');
const { exportJob, exportJobs, EXPORT_TYPES, QuoteExportError } = require('../../src/lib/quoteExport');
const { createExportQueue, ExportQueueTimeout } = require('../../src/lib/exportQueue');

const URL = 'https://script.example/exec';
const pdfBytes = Buffer.from('%PDF-1.4 hello');
const NOW = new Date(2024, 2, 5, 9, 7, 3);
const baseJob = {
    company_code: 'AC', company_name: 'Acme', address_line1: 'a', address_line2: 'b',
    attention: 'Bob', created_at: '2024-03-05T12:00:00', due_date: '2024-04-01T12:00:00', tax_code: 0,
};
const parts = [{ number: 'P-1', quantity: 2, price: 5 }];
const reply = (obj) => ({ ok: true, status: 200, text: async () => JSON.stringify(obj) });
const pdfReply = (jobNumber) => reply({ ok: true, jobNumber, pdfBase64: pdfBytes.toString('base64') });

// Job N has job_number N * 100; unknown ids in `missing` have no row.
function setup({ post, missing = [], getSheet } = {}) {
    let nextFileId = 900;
    const db = makeFakeTxDb([
        { match: /FROM job\s+JOIN company/, rows: (p) => (missing.includes(p[0]) ? [] : [{ ...baseJob, job_number: p[0] * 100 }]) },
        { match: /FROM job_part/, rows: parts },
        { match: /INSERT INTO uploaded_files/, rows: () => ({ insertId: nextFileId++ }) },
    ]);
    const posts = [];
    const warnings = [];
    const opts = {
        getSheet: getSheet || (async () => ({
            async clear() {}, async loadCells() {}, getCell: () => ({}),
            async saveUpdatedCells() {}, async getCellsInRange() { return []; }, async batchUpdate() {},
        })),
        post: async (url, init) => {
            posts.push({ url, init });
            return post ? post(url, init) : pdfReply(JSON.parse(init.body).jobNumber);
        },
        scriptUrl: URL,
        now: () => NOW,
        log: { warn: (m) => warnings.push(m) },
        queue: createExportQueue(),
    };
    const inserts = () => db.calls.filter((c) => /INSERT INTO uploaded_files/.test(c.sql));
    return { db, opts, posts, warnings, inserts };
}

async function rejection(promise) {
    try { await promise; } catch (e) { return e; }
    assert.fail('expected rejection');
}

const CASES = [
    ['quote', 'exportQuote', 'Quote'],
    ['order', 'exportOrder', 'Order'],
    ['invoice', 'exportInvoice', 'Invoice'],
    ['packing', 'exportPackList', 'PackingList'],
    ['shipping', 'exportShipping', 'Shipping'],
];

for (const [type, action, label] of CASES) {
    test(`${type} posts ${action} and saves one pdf to the job`, async () => {
        const s = setup();
        const result = await exportJob(s.db, 7, type, s.opts);
        const filename = `${label}-700-20240305-090703.pdf`;
        assert.deepEqual(result, { id: 7, type, action, jobNumber: 700, parts: 1, fileId: 900, filename });
        assert.equal(s.posts.length, 1);
        assert.equal(s.posts[0].url, URL);
        assert.equal(s.posts[0].init.method, 'POST');
        assert.deepEqual(JSON.parse(s.posts[0].init.body), { action, jobId: '7', jobNumber: 700 });
        assert.equal(s.inserts().length, 1);
        const [name, mimetype, size, content, jobId] = s.inserts()[0].params;
        assert.deepEqual([name, mimetype, size, jobId], [filename, 'application/pdf', pdfBytes.length, 7]);
        assert.ok(content.equals(pdfBytes));
        assert.equal(s.warnings.length, 0);
    });
}

test('EXPORT_TYPES maps the five types to their script actions', () => {
    assert.deepEqual(Object.keys(EXPORT_TYPES), CASES.map((c) => c[0]));
});

test('unknown type is 400 and nothing runs', async () => {
    const s = setup();
    const e = await rejection(exportJob(s.db, 7, 'bogus', s.opts));
    assert.ok(e instanceof QuoteExportError);
    assert.equal(e.status, 400);
    assert.equal(s.posts.length, 0);
    assert.equal(s.db.calls.length, 0);
});

test('missing scriptUrl is 503', async () => {
    const s = setup();
    const e = await rejection(exportJob(s.db, 7, 'order', { ...s.opts, scriptUrl: '' }));
    assert.equal(e.status, 503);
    assert.equal(s.posts.length, 0);
});

test('unknown job is 404', async () => {
    const s = setup({ missing: [7] });
    const e = await rejection(exportJob(s.db, 7, 'order', s.opts));
    assert.equal(e.status, 404);
    assert.equal(s.posts.length, 0);
});

test('non-ok script response is 502 and saves nothing', async () => {
    const s = setup({ post: async () => ({ ok: false, status: 500 }) });
    const e = await rejection(exportJob(s.db, 7, 'order', s.opts));
    assert.equal(e.status, 502);
    assert.equal(s.inserts().length, 0);
});

test('job number mismatch is 409 and saves no file', async () => {
    const s = setup({ post: async () => pdfReply(999) });
    const e = await rejection(exportJob(s.db, 7, 'order', s.opts));
    assert.ok(e instanceof QuoteExportError);
    assert.equal(e.status, 409);
    assert.match(e.message, /job 999, not job 700/);
    assert.equal(s.inserts().length, 0);
});

test('script error reply is 502 and saves no file', async () => {
    const s = setup({ post: async () => reply({ ok: false, jobNumber: 700, pdfBase64: 'x', error: 'boom' }) });
    const e = await rejection(exportJob(s.db, 7, 'order', s.opts));
    assert.equal(e.status, 502);
    assert.equal(s.inserts().length, 0);
});

test('old script reply returns fileId null, logs a warning and saves no file', async () => {
    const s = setup({ post: async () => ({ ok: true, status: 200 }) });
    const result = await exportJob(s.db, 7, 'invoice', s.opts);
    assert.deepEqual(result, {
        id: 7, type: 'invoice', action: 'exportInvoice', jobNumber: 700, parts: 1, fileId: null, filename: null,
    });
    assert.equal(s.inserts().length, 0);
    assert.equal(s.warnings.length, 1);
});

test('script timeout is 504 and the post gets a timeout signal', async () => {
    let signal;
    const s = setup({
        post: async (url, init) => {
            signal = init.signal;
            throw new DOMException('timed out', 'TimeoutError');
        },
    });
    const e = await rejection(exportJob(s.db, 7, 'order', { ...s.opts, timeoutMs: 50 }));
    assert.equal(e.status, 504);
    assert.ok(signal instanceof AbortSignal);
    assert.equal(s.inserts().length, 0);
});

test('timeoutMs defaults to 120000 ms', async () => {
    const original = AbortSignal.timeout;
    const seen = [];
    AbortSignal.timeout = (ms) => { seen.push(ms); return original.call(AbortSignal, ms); };
    try {
        const s = setup();
        await exportJob(s.db, 7, 'order', s.opts);
    } finally {
        AbortSignal.timeout = original;
    }
    assert.deepEqual(seen, [120000]);
});

test('concurrent exports for different jobs run in turn, each file saved to its own job', async () => {
    let active = 0;
    let maxActive = 0;
    const order = [];
    const s = setup({
        post: async (url, init) => {
            const body = JSON.parse(init.body);
            active++;
            maxActive = Math.max(maxActive, active);
            order.push(`start ${body.jobId}`);
            await new Promise((r) => setTimeout(r, 10));
            order.push(`end ${body.jobId}`);
            active--;
            return pdfReply(body.jobNumber);
        },
    });
    const [a, b] = await Promise.all([
        exportJob(s.db, 1, 'order', s.opts),
        exportJob(s.db, 2, 'order', s.opts),
    ]);
    assert.equal(maxActive, 1);
    assert.deepEqual(order, ['start 1', 'end 1', 'start 2', 'end 2']);
    assert.deepEqual([a.id, a.jobNumber, a.fileId], [1, 100, 900]);
    assert.deepEqual([b.id, b.jobNumber, b.fileId], [2, 200, 901]);
    assert.deepEqual(s.inserts().map((c) => c.params[4]), [1, 2]);
});

test('exportJobs runs types in order and returns all results', async () => {
    const s = setup();
    const out = await exportJobs(s.db, 3, ['quote', 'invoice'], s.opts);
    assert.deepEqual(out.results.map((r) => r.action), ['exportQuote', 'exportInvoice']);
    assert.equal(out.failed, null);
    assert.deepEqual(out.skipped, []);
    assert.deepEqual(s.posts.map((p) => JSON.parse(p.init.body).action), ['exportQuote', 'exportInvoice']);
});

test('exportJobs stops at the first failure, keeps earlier results and lists the rest skipped', async () => {
    let n = 0;
    const s = setup({
        post: async (url, init) => (++n === 2 ? pdfReply(999) : pdfReply(JSON.parse(init.body).jobNumber)),
    });
    const out = await exportJobs(s.db, 3, ['quote', 'order', 'invoice', 'shipping'], s.opts);
    assert.deepEqual(out.results.map((r) => r.type), ['quote']);
    assert.equal(out.failed.type, 'order');
    assert.equal(out.failed.status, 409);
    assert.match(out.failed.error, /job 999, not job 300/);
    assert.deepEqual(out.skipped, ['invoice', 'shipping']);
    assert.equal(s.posts.length, 2);
});

test('exportJobs reports a script timeout as failed with 504', async () => {
    const s = setup({ post: async () => { throw new DOMException('t', 'TimeoutError'); } });
    const out = await exportJobs(s.db, 3, ['quote', 'order'], s.opts);
    assert.deepEqual(out.results, []);
    assert.equal(out.failed.status, 504);
    assert.deepEqual(out.skipped, ['order']);
});

test('exportJobs rejects 400 for any unknown type before running anything', async () => {
    const s = setup();
    const e = await rejection(exportJobs(s.db, 3, ['quote', 'bogus'], s.opts));
    assert.equal(e.status, 400);
    assert.equal(s.posts.length, 0);
});

test('queue wait timeout makes exportJob reject with a 503 QuoteExportError', async () => {
    const s = setup();
    const queue = { run: async () => { throw new ExportQueueTimeout(); } };
    const e = await rejection(exportJob(s.db, 7, 'order', { ...s.opts, queue }));
    assert.ok(e instanceof QuoteExportError);
    assert.equal(e.status, 503);
    assert.equal(e.message, 'Another export is still running; try again shortly');
});

test('exportJobs reports a status-less error as failed 500, keeping earlier results and skipped', async () => {
    let n = 0;
    const s = setup({
        post: async (url, init) => {
            if (++n === 2) throw new Error('secret db detail');
            return pdfReply(JSON.parse(init.body).jobNumber);
        },
    });
    const errors = [];
    const out = await exportJobs(s.db, 3, ['quote', 'order', 'invoice'], { ...s.opts, log: { warn() {}, error: (...a) => errors.push(a) } });
    assert.deepEqual(out.results.map((r) => r.type), ['quote']);
    assert.deepEqual(out.failed, { type: 'order', status: 500, error: 'Export failed' });
    assert.deepEqual(out.skipped, ['invoice']);
    assert.equal(errors.length, 1);
});
