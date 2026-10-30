const { test } = require('node:test');
const assert = require('node:assert');
const { recordInvoiceClick } = require('../../src/lib/invoiceClick');

const NOW = new Date('2026-03-04T15:30:00.000Z');

function fakeDb({ job, max = 41 }) {
    const calls = [];
    return {
        calls,
        execute: async (sql, params) => {
            calls.push({ sql, params });
            if (/FROM job WHERE id/.test(sql)) return [job ? [job] : []];
            if (/MAX\(/.test(sql)) return [[{ max_number: max }]];
            return [{ affectedRows: 1 }];
        },
    };
}
const writes = (db) => db.calls.filter((c) => /^\s*(UPDATE|REPLACE)/i.test(c.sql));

test('returns null and writes nothing when the job does not exist', async () => {
    const db = fakeDb({ job: null });
    assert.strictEqual(await recordInvoiceClick(db, 9, { now: () => NOW }), null);
    assert.deepStrictEqual(writes(db), []);
});

test('first click assigns the next number, dates it today and writes metadata', async () => {
    const db = fakeDb({ job: { invoice_number: '  ' } });
    const res = await recordInvoiceClick(db, 3, { now: () => NOW });
    assert.deepStrictEqual(res, { invoiceNumber: '42', assigned: true });
    const [upd, meta] = writes(db);
    assert.match(upd.sql, /^\s*UPDATE job SET invoice_number = \?/);
    assert.match(upd.sql, /invoice_date/);
    assert.match(upd.sql, /invoice_clicked_at/);
    assert.match(upd.sql, /ship_date/);
    assert.deepStrictEqual(upd.params, ['42', '2026-03-04', NOW, 3]);
    assert.match(meta.sql, /REPLACE INTO metadata/);
    assert.deepStrictEqual(meta.params, ['42']);
});

test('first click treats a null invoice number as blank', async () => {
    const db = fakeDb({ job: { invoice_number: null }, max: null });
    assert.deepStrictEqual(await recordInvoiceClick(db, 3, { now: () => NOW }), { invoiceNumber: '1', assigned: true });
});

test('re-click keeps number and invoice date, updates click and ship date, no metadata', async () => {
    const db = fakeDb({ job: { invoice_number: ' 17 ' } });
    const res = await recordInvoiceClick(db, 3, { now: () => NOW });
    assert.deepStrictEqual(res, { invoiceNumber: '17', assigned: false });
    const w = writes(db);
    assert.strictEqual(w.length, 1);
    assert.doesNotMatch(w[0].sql, /invoice_number|invoice_date|metadata/);
    assert.match(w[0].sql, /invoice_clicked_at = \?, ship_date = \?/);
    assert.deepStrictEqual(w[0].params, [NOW, '2026-03-04', 3]);
    assert.strictEqual(db.calls.some((c) => /MAX\(/.test(c.sql)), false);
});
