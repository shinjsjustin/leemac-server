const { test } = require('node:test');
const assert = require('node:assert');
const { nextInvoiceNumber, invoiceNumberOwner, isDuplicateInvoice } = require('../../src/lib/invoiceNumbers');

function stubDb(rows) {
    const calls = [];
    return { calls, execute: async (sql, params) => { calls.push({ sql, params }); return [rows]; } };
}

test('nextInvoiceNumber returns the highest numeric plus one as a string', async () => {
    const db = stubDb([{ max_number: 41 }]);
    assert.strictEqual(await nextInvoiceNumber(db), '42');
    assert.match(db.calls[0].sql, /REGEXP '\^\[0-9\]\+\$'/);
    assert.match(db.calls[0].sql, /CAST\(.* AS UNSIGNED\)/);
});

test('nextInvoiceNumber accepts a string aggregate from mysql', async () => {
    assert.strictEqual(await nextInvoiceNumber(stubDb([{ max_number: '99' }])), '100');
});

test('nextInvoiceNumber returns 1 when no numeric invoice exists', async () => {
    assert.strictEqual(await nextInvoiceNumber(stubDb([{ max_number: null }])), '1');
});

test('invoiceNumberOwner returns the other job number, querying with number and job id', async () => {
    const db = stubDb([{ job_number: 'J-77' }]);
    assert.strictEqual(await invoiceNumberOwner(db, '12', 5), 'J-77');
    assert.deepStrictEqual(db.calls[0].params, ['12', 5]);
});

test('invoiceNumberOwner returns null when nobody uses the number', async () => {
    assert.strictEqual(await invoiceNumberOwner(stubDb([]), '12', 5), null);
});

test('isDuplicateInvoice is true only for ER_DUP_ENTRY naming uq_job_invoice_number', () => {
    const msg = "Duplicate entry '12' for key 'job.uq_job_invoice_number'";
    assert.strictEqual(isDuplicateInvoice({ code: 'ER_DUP_ENTRY', message: msg }), true);
    assert.strictEqual(isDuplicateInvoice({ code: 'ER_DUP_ENTRY', message: "for key 'other'" }), false);
    assert.strictEqual(isDuplicateInvoice({ code: 'ER_X', message: msg }), false);
    assert.strictEqual(isDuplicateInvoice(null), false);
});
