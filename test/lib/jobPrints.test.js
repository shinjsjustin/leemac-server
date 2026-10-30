const { test } = require('node:test');
const assert = require('node:assert');
const { jobPrintables, printJobDrawings } = require('../../src/lib/jobPrints');

const LETTER = { id: 1, name: 'Office', cups_queue: 'Q', role: 'letter', media: 'Letter', copies: {}, enabled: 1 };
const PDF = { id: 11, filename: 'a.pdf', mimetype: 'application/pdf' };
const NAMED_PDF = { id: 12, filename: 'B.PDF', mimetype: 'application/octet-stream' };
const STEP = { id: 13, filename: 'c.step', mimetype: 'application/octet-stream' };

// job: row or null; docs: site PDF rows; drawings: part files.
function makeDb({ job = { invoice_clicked_at: null }, docs = [], drawings = [], printers = [LETTER] } = {}) {
    return {
        calls: [],
        async execute(sql, params) {
            this.calls.push({ sql, params });
            if (/FROM job WHERE/.test(sql)) return [job ? [job] : []];
            if (/JOIN job_part/.test(sql)) return [drawings];
            if (/FROM uploaded_files\s+WHERE job_id/.test(sql)) return [docs];
            if (/FROM uploaded_files WHERE id/.test(sql)) return [drawings.filter((d) => d.id === params[0])];
            if (/FROM printer/.test(sql)) return [printers];
            if (/^\s*INSERT/.test(sql)) return [{ insertId: 50 }];
            return [[]];
        },
    };
}

async function code(promise) {
    try { await promise; } catch (e) { return e.code; }
    return null;
}

const T = new Date(1);
const doc = (id, label) => ({ id, filename: `${label}-J1-20240101-000000-site.pdf`, uploaded_at: T });

test('jobPrintables lists five documents in order with labels, files and reasons when invoice not clicked', async () => {
    const db = makeDb({ docs: [doc(1, 'Quote')], drawings: [PDF, NAMED_PDF, STEP] });
    const out = await jobPrintables(db, 7);
    assert.deepStrictEqual(out.documents.map((d) => [d.type, d.label]), [
        ['quote', 'Quote'], ['order', 'Order'], ['invoice', 'Invoice'], ['packing', 'Packing list'], ['shipping', 'Shipping label'],
    ]);
    assert.deepStrictEqual(out.documents.map((d) => d.reason), [
        null, 'Not made yet', 'Click Update invoice first', 'Click Update invoice first', 'Click Update invoice first',
    ]);
    assert.strictEqual(out.documents[0].file_id, 1);
    assert.strictEqual(out.documents[0].filename, 'Quote-J1-20240101-000000-site.pdf');
    assert.strictEqual(out.documents[1].file_id, null);
    assert.strictEqual(out.documents[1].filename, null);
    assert.strictEqual(out.drawings, 2);
});

test('jobPrintables gives Not made yet to gated types once the invoice is clicked, null when a PDF exists', async () => {
    const db = makeDb({ job: { invoice_clicked_at: T }, docs: [doc(3, 'Invoice')] });
    const out = await jobPrintables(db, 7);
    assert.deepStrictEqual(out.documents.map((d) => d.reason), [
        'Not made yet', 'Not made yet', null, 'Not made yet', 'Not made yet',
    ]);
    assert.strictEqual(out.drawings, 0);
});

test('jobPrintables never selects file content', async () => {
    const db = makeDb();
    await jobPrintables(db, 7);
    assert.ok(db.calls.every((c) => !/content/i.test(c.sql)));
});

test('printJobDrawings queues one drawing job per PDF, skipping other files', async () => {
    const db = makeDb({ drawings: [PDF, STEP, NAMED_PDF] });
    const out = await printJobDrawings(db, 7, { id: 'u', name: 'Ann' });
    assert.deepStrictEqual(out, { queued: 2, printer: 'Office' });
    const inserts = db.calls.filter((c) => /INSERT INTO print_job/.test(c.sql));
    assert.deepStrictEqual(inserts.map((c) => [c.params[0], c.params[2]]), [[11, 'drawing'], [12, 'drawing']]);
});

test('printJobDrawings returns queued 0 and no printer when there are no PDF drawings', async () => {
    const db = makeDb({ drawings: [STEP] });
    assert.deepStrictEqual(await printJobDrawings(db, 7, { id: 'u', name: 'Ann' }), { queued: 0, printer: null });
    assert.ok(!db.calls.some((c) => /INSERT/.test(c.sql)));
});

test('both functions throw NOT_FOUND for a missing job', async () => {
    assert.strictEqual(await code(jobPrintables(makeDb({ job: null }), 7)), 'NOT_FOUND');
    assert.strictEqual(await code(printJobDrawings(makeDb({ job: null }), 7, { id: 'u', name: 'n' })), 'NOT_FOUND');
});
