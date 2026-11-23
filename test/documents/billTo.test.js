const test = require('node:test');
const assert = require('node:assert/strict');
const { makeFakeDb } = require('../helpers/fakeDb');
const { loadJobSummary } = require('../../src/lib/jobSummary');
const { formFromSummary, dataFromForm, documentData } = require('../../src/lib/documents/data');
const { DOCUMENT_TYPES, renderDocumentHtml } = require('../../src/lib/documents');

const job = (overrides = {}) => ({
    job_number: 13706,
    company_code: 'QWD',
    company_name: 'WD Media',
    address_line1: '1 Main St',
    address_line2: 'San Jose CA',
    attention: 'Bob',
    po_number: 'PO-9',
    invoice_number: '10796',
    created_at: new Date(2026, 0, 5),
    invoice_date: new Date(2026, 1, 3),
    invoice_clicked_at: new Date(2026, 1, 12),
    tax_code: 0,
    tax: 0,
    tax_percent: 0,
    ...overrides,
});
const parts = [{ number: 'P-1', rev: 'A', description: 'Bracket', details: '', quantity: 2, price: 5 }];
const billed = (o = {}) => job({
    bill_to_name: 'WD Payables Inc.',
    bill_to_line1: ' PO Box 99 ',
    bill_to_line2: '',
    bill_to_line3: 'Austin TX',
    bill_to_line4: null,
    bill_to_line5: '   ',
    ...o,
});
const partySection = (html, label) => {
    const re = new RegExp(`<div class="label">${label}</div>([\\s\\S]*?)</div>\\s*(?=<div class="party">|<div class="headline">)`);
    return re.exec(html)[0];
};
const invoice = (j) => renderDocumentHtml('invoice', documentData({ job: j, parts }));

test('loadJobSummary selects the bill-to columns from company', async () => {
    const db = makeFakeDb([{ match: /FROM job\s+JOIN company/, rows: [{}] }]);
    await loadJobSummary(db, 1);
    for (const col of ['name', 'line1', 'line2', 'line3', 'line4', 'line5']) {
        assert.match(db.calls[0].sql, new RegExp(`company\\.bill_to_${col}\\b`));
    }
});

test('formFromSummary adds billTo with trimmed non-empty lines in order', () => {
    const { fields } = formFromSummary({ job: billed(), parts: [] });
    assert.deepEqual(fields.billTo, { name: 'WD Payables Inc.', lines: ['PO Box 99', 'Austin TX'] });
    assert.deepEqual(fields.customer, { name: 'WD Media', line1: '1 Main St', line2: 'San Jose CA', attention: 'Bob' });
});

test('formFromSummary adds no billTo key when bill_to_name is blank', () => {
    for (const blank of [null, undefined, '', '   ']) {
        const { fields } = formFromSummary({ job: billed({ bill_to_name: blank }), parts: [] });
        assert.equal(Object.hasOwn(fields, 'billTo'), false);
    }
});

test('invoice prints Bill to with bill-to name and lines, Ship to keeps company', () => {
    const html = invoice(billed());
    const bill = partySection(html, 'Bill to');
    assert.match(bill, /WD Payables Inc\./);
    assert.match(bill, /PO Box 99/);
    assert.match(bill, /Austin TX/);
    assert.doesNotMatch(bill, /WD Media|1 Main St/);
    assert.match(bill, /Attn<\/b> Accounts Payable/);
    const ship = partySection(html, 'Ship to');
    assert.match(ship, /WD Media/);
    assert.match(ship, /1 Main St/);
    assert.match(ship, /San Jose CA/);
    assert.match(ship, /Attn<\/b> Bob/);
});

test('invoice escapes bill-to text', () => {
    const html = invoice(billed({ bill_to_name: '<b>X & Y</b>' }));
    assert.ok(html.includes('&lt;b&gt;X &amp; Y&lt;/b&gt;'));
    assert.ok(!html.includes('<b>X & Y</b>'));
});

test('invoice drops Attn Accounts Payable when a bill-to line says accounts payable', () => {
    for (const line of ['Accounts Payable', 'ATTN: ACCOUNTS PAYABLE dept']) {
        const bill = partySection(invoice(billed({ bill_to_line2: line })), 'Bill to');
        assert.match(bill, new RegExp(line));
        assert.doesNotMatch(bill, /class="attn"/);
    }
});

test('invoice with blank bill_to_name is identical to one with no bill-to columns', () => {
    const plain = invoice(job());
    assert.equal(invoice(billed({ bill_to_name: '  ' })), plain);
    assert.match(partySection(plain, 'Bill to'), /WD Media[\s\S]*Accounts Payable/);
});

test('invoice snapshot without billTo still prints Bill to from customer', () => {
    const { fields } = formFromSummary({ job: job(), parts: [] });
    const data = dataFromForm({ fields, parts: [] });
    assert.equal(Object.hasOwn(data, 'billTo'), false);
    assert.match(partySection(renderDocumentHtml('invoice', data), 'Bill to'), /WD Media/);
});

test('quote, order, packing and shipping never show the bill-to text', () => {
    const data = documentData({ job: billed({ bill_to_line2: 'Secret Annex' }), parts });
    for (const type of Object.keys(DOCUMENT_TYPES).filter((t) => t !== 'invoice')) {
        const html = renderDocumentHtml(type, data);
        assert.ok(!html.includes('WD Payables'), type);
        assert.ok(!html.includes('Secret Annex'), type);
    }
});
