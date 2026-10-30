const { test } = require('node:test');
const assert = require('node:assert');
const printers = require('../../src/lib/printers');
const { testPrintPdf } = require('../../src/lib/testPrintPdf');

const LETTER = { id: 1, name: 'Brother', cups_queue: 'Brother_HL', role: 'letter', media: 'Letter', copies: { packing: 2, quote: 1 }, enabled: 1 };
const LABEL = { id: 2, name: 'Thermal', cups_queue: 'Thermal', role: 'label', media: '4x6', copies: { shipping: 3 }, enabled: 1 };

function makeDb(rows = [], result = { insertId: 5, affectedRows: 1 }) {
    return {
        calls: [],
        async execute(sql, params) {
            this.calls.push({ sql, params });
            return [/^\s*(INSERT|UPDATE)/i.test(sql) ? result : rows];
        },
    };
}

async function code(promise) {
    try { await promise; } catch (e) { return e.code; }
    return null;
}

test('pickPrinter asks for the enabled label printer when kind is shipping', async () => {
    const db = makeDb([LABEL]);
    const p = await printers.pickPrinter(db, 'shipping');
    assert.strictEqual(p.id, 2);
    assert.match(db.calls[0].sql, /enabled\s*=\s*1/);
    assert.deepStrictEqual(db.calls[0].params, ['label']);
});

test('pickPrinter asks for the enabled letter printer for every other kind', async () => {
    for (const kind of ['quote', 'order', 'invoice', 'packing', 'drawing', 'file']) {
        const db = makeDb([LETTER]);
        await printers.pickPrinter(db, kind);
        assert.deepStrictEqual(db.calls[0].params, ['letter'], kind);
    }
});

test('pickPrinter throws NO_PRINTER when none is enabled', async () => {
    assert.strictEqual(await code(printers.pickPrinter(makeDb([]), 'quote')), 'NO_PRINTER');
});

test('lpOptions fits letter pages to the page with the kind copies', () => {
    assert.deepStrictEqual(printers.lpOptions(LETTER, 'packing'), { copies: 2, options: ['media=Letter', 'fit-to-page'] });
});

test('lpOptions prints 4x6 labels at scaling=100', () => {
    assert.deepStrictEqual(printers.lpOptions(LABEL, 'shipping'), { copies: 3, options: ['media=4x6', 'scaling=100'] });
});

test('lpOptions parses copies stored as a JSON string and defaults a missing kind to 1', () => {
    const p = { ...LETTER, copies: '{"packing":4}' };
    assert.strictEqual(printers.lpOptions(p, 'packing').copies, 4);
    assert.strictEqual(printers.lpOptions(p, 'quote').copies, 1);
});

test('lpOptions keeps 0 copies', () => {
    assert.strictEqual(printers.lpOptions({ ...LETTER, copies: { quote: 0 } }, 'quote').copies, 0);
});

test('listPrinters returns rows ordered by id', async () => {
    const db = makeDb([LETTER, LABEL]);
    assert.deepStrictEqual(await printers.listPrinters(db), [LETTER, LABEL]);
    assert.match(db.calls[0].sql, /FROM printer ORDER BY id/);
});

const VALID = { name: 'X', cups_queue: 'My_Queue-1.a', role: 'label', media: '4x6', copies: { quote: 20, order: 0 } };

test('createPrinter inserts a valid printer and returns its id', async () => {
    const db = makeDb();
    assert.strictEqual(await printers.createPrinter(db, VALID), 5);
    assert.match(db.calls[0].sql, /INSERT INTO printer/);
    assert.ok(db.calls[0].params.includes('My_Queue-1.a'));
    assert.ok(db.calls[0].params.includes(JSON.stringify(VALID.copies)));
});

test('createPrinter rejects bad role, queue name and copies without touching the db', async () => {
    const bad = [
        { role: 'color' },
        { cups_queue: 'a b' },
        { cups_queue: 'a;rm' },
        { cups_queue: '' },
        { copies: { quote: 21 } },
        { copies: { quote: -1 } },
        { copies: { quote: 1.5 } },
        { name: '' },
    ];
    for (const patch of bad) {
        const db = makeDb();
        assert.strictEqual(await code(printers.createPrinter(db, { ...VALID, ...patch })), 'INVALID', JSON.stringify(patch));
        assert.strictEqual(db.calls.length, 0);
    }
});

test('updatePrinter updates only the given fields', async () => {
    const db = makeDb();
    await printers.updatePrinter(db, 2, { enabled: false, copies: { quote: 3 } });
    assert.match(db.calls[0].sql, /UPDATE printer SET copies = \?, enabled = \? WHERE id = \?/);
    assert.deepStrictEqual(db.calls[0].params, ['{"quote":3}', 0, 2]);
});

test('updatePrinter validates fields and throws NOT_FOUND when no row matches', async () => {
    assert.strictEqual(await code(printers.updatePrinter(makeDb(), 2, { cups_queue: 'bad name' })), 'INVALID');
    assert.strictEqual(await code(printers.updatePrinter(makeDb(), 2, { role: 'x' })), 'INVALID');
    assert.strictEqual(await code(printers.updatePrinter(makeDb(), 2, { copies: { a: 99 } })), 'INVALID');
    assert.strictEqual(await code(printers.updatePrinter(makeDb([], { affectedRows: 0 }), 2, { name: 'n' })), 'NOT_FOUND');
});

test('testPrintPdf builds a one-page PDF with a valid xref naming the printer and time', () => {
    const buf = testPrintPdf('Brother (HL)', new Date('2026-01-02T03:04:05Z'));
    assert.ok(Buffer.isBuffer(buf));
    const text = buf.toString('latin1');
    assert.ok(text.startsWith('%PDF-'));
    assert.ok(text.trimEnd().endsWith('%%EOF'));
    assert.match(text, /Brother \\\(HL\\\)/);
    assert.match(text, /2026-01-02T03:04:05/);
    assert.strictEqual((text.match(/\/Type \/Page\b/g) || []).length, 1);
    const xrefAt = Number(/startxref\n(\d+)/.exec(text)[1]);
    assert.ok(text.slice(xrefAt).startsWith('xref'));
    const entries = text.slice(xrefAt).split('\n').filter((l) => /^\d{10} 00000 n/.test(l));
    assert.ok(entries.length >= 4);
    entries.forEach((l, i) => {
        assert.ok(text.slice(Number(l.slice(0, 10))).startsWith(`${i + 1} 0 obj`), `object ${i + 1}`);
    });
    assert.match(text, new RegExp(`/Size ${entries.length + 1}`));
});
