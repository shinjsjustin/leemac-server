const test = require('node:test');
const assert = require('node:assert/strict');
const { documentData, LEEMAC } = require('../../src/lib/documents/data');
const { invoiceHtml } = require('../../src/lib/documents/invoice');
const { packingHtml } = require('../../src/lib/documents/packing');
const { shippingHtml } = require('../../src/lib/documents/shipping');
const { DOCUMENT_TYPES, renderDocumentHtml } = require('../../src/lib/documents');

const build = (jobOverrides = {}, parts) => documentData({
    job: {
        job_number: 13706,
        company_code: 'QWD',
        company_name: 'WD Media',
        address_line1: '1 Main St',
        address_line2: 'San Jose CA',
        attention: 'Bob',
        po_number: 'PO-9',
        invoice_number: 'INV-77',
        created_at: new Date(2026, 0, 5),
        invoice_date: new Date(2026, 1, 7),
        ship_date: new Date(2026, 1, 8),
        invoice_clicked_at: new Date(2026, 1, 8),
        tax_code: 1,
        tax: 0,
        tax_percent: 10,
        ...jobOverrides,
    },
    parts: parts || [{ number: 'P-1', rev: 'A', description: 'Bracket', details: 'Anodize', quantity: 2, price: 5 }],
});

const hasAll = (html, texts) => {
    for (const text of texts) assert.ok(html.includes(text), `missing ${text}`);
};

const footerOf = (html) => /<meta name="doc-footer" content="([^"]*)">/.exec(html)[1];

test('invoiceHtml shows parties, headline, facts, remit to, terms, tax row and total due', () => {
    const html = invoiceHtml(build());
    assert.match(html, /^<!DOCTYPE html>/);
    hasAll(html, [
        LEEMAC.name, 'Bill to', 'Ship to', 'WD Media', '1 Main St', 'Attn</b> Accounts Payable', 'Attn</b> Bob',
        'Amount due', '$11.00', 'Due Mar 9, 2026',
        'Invoice #', 'INV-77', 'Invoice date', 'Feb 7, 2026', 'Payment due', 'Ship date', 'Feb 8, 2026',
        'PO number', 'PO-9', 'Reference #', '13706QWD', 'Ship via', LEEMAC.shipVia,
        'Remit to', LEEMAC.street, LEEMAC.city, 'Payment terms', LEEMAC.terms, 'Total due', 'Tax 10%', '$1.00', '$10.00',
        'P-1', 'Bracket', 'Anodize',
    ]);
    assert.match(html, /<body class="letter">/);
});

test('invoice PO date fact follows PO number', () => {
    const html = invoiceHtml(build({ po_date: new Date(2026, 0, 20) }));
    assert.match(html, /PO number<\/div><div class="value">PO-9<\/div><\/div><div class="fact"><div class="label">PO date<\/div><div class="value">Jan 20, 2026</);
    assert.ok(!invoiceHtml(build()).includes('PO date'));
});

test('invoice payment due is invoice date plus 30 days and omitted when the date is blank', () => {
    assert.match(invoiceHtml(build({ invoice_date: new Date(2026, 0, 15) })), /Payment due<\/div><div class="value">Feb 14, 2026</);
    const blank = invoiceHtml(build({ invoice_date: null }));
    assert.ok(!blank.includes('Payment due'));
    assert.ok(!blank.includes('class="sub"'));
});

test('invoice tax row is plain Tax with the flat amount when the amount overrides the percent', () => {
    const html = invoiceHtml(build({ tax: 3, tax_percent: 10 }));
    assert.match(html, /<td>Tax<\/td><td class="n">\$3\.00</);
    assert.ok(!html.includes('10%'));
});

test('invoice and packing carry their doc-footer text', () => {
    assert.equal(footerOf(invoiceHtml(build())), 'Invoice INV-77 · Ref 13706QWD · PO PO-9');
    assert.equal(footerOf(packingHtml(build())), 'Packing list 13706QWD · Invoice INV-77');
});

test('packingHtml shows ship to, Shipped headline, facts, unpriced Qty shipped lines and sign-off', () => {
    const html = packingHtml(build({}, [
        { number: 'P-1', rev: 'A', description: 'Bracket', details: 'x', quantity: 7, price: 5 },
    ]));
    hasAll(html, [
        'Ship to', 'WD Media', 'Attn</b> Bob', 'Shipped', '1 lines · 7 pcs',
        'Ship date', 'Feb 8, 2026', 'Invoice #', 'INV-77', 'Reference #', '13706QWD', 'PO number', 'PO-9',
        'Ship via', LEEMAC.shipVia, 'Qty shipped', 'P-1', 'Bracket', 'Received by', 'Date',
    ]);
    assert.ok(!html.includes('Unit price'));
    assert.ok(!html.includes('Bill to'));
    assert.match(html, /<body class="letter">/);
});

const manyParts = (n) => Array.from({ length: n }, (_, i) => ({
    number: `PN-${i + 1}`, rev: 'A', description: `Desc ${i + 1}`, details: '', quantity: 3, price: 1,
}));

test('shippingHtml is a label-doc with From, Ship to, refs, parts and Ship date foot, and no doc-footer', () => {
    const html = shippingHtml(build({}, [
        { number: 'P-1', rev: 'A', description: 'Bracket', details: 'Anodize', quantity: 2, price: 5 },
        { number: 'P-2', rev: '', description: 'Plate', details: 'Raw', quantity: 9, price: 1 },
    ]));
    assert.match(html, /<body class="label-doc">/);
    assert.ok(!html.includes('doc-footer'));
    assert.ok(html.includes('<title>Shipping 13706QWD</title>'));
    hasAll(html, [
        'From', LEEMAC.name, LEEMAC.street, LEEMAC.city, LEEMAC.phone,
        'Ship to', 'WD Media', '1 Main St', 'San Jose CA', 'Attn: Bob',
        'PO', 'PO-9', 'Invoice', 'INV-77', 'Ref', '13706QWD',
        'P-1 rev A', 'Bracket', 'Qty 2', 'P-2', 'Plate', 'Qty 9',
        'Ship date Feb 8, 2026', '2 lines &middot; 11 pcs',
    ]);
    assert.ok(!html.includes('more, see packing list'));
});

test('shippingHtml shows all 8 parts but only 7 plus a more line from 9 parts', () => {
    const eight = shippingHtml(build({}, manyParts(8)));
    assert.ok(eight.includes('PN-8'));
    assert.ok(!eight.includes('more, see packing list'));
    const nine = shippingHtml(build({}, manyParts(9)));
    assert.ok(nine.includes('PN-7'));
    assert.ok(!nine.includes('PN-8'));
    assert.ok(nine.includes('+2 more, see packing list'));
    assert.ok(nine.includes('9 lines &middot; 27 pcs'));
});

test('shippingHtml leaves no PO or Attn label when blank', () => {
    const html = shippingHtml(build({ po_number: '', attention: '' }));
    assert.ok(!html.includes('Attn'));
    assert.ok(!html.includes('<div class="tag">PO</div>'));
    assert.ok(html.includes('<div class="tag">Invoice</div>'));
});

test('every new document escapes job values', () => {
    const data = build(
        { company_name: '<script>c</script>', attention: '<script>a</script>', po_number: '<script>p</script>', invoice_number: '<script>i</script>' },
        [{ number: '<script>n</script>', rev: 'A', description: '<script>d</script>', details: '<script>x</script>', quantity: 1, price: 1 }],
    );
    for (const html of [invoiceHtml(data), packingHtml(data), shippingHtml(data)]) {
        assert.ok(!html.includes('<script>'));
        assert.ok(html.includes('&lt;script&gt;c&lt;/script&gt;'));
    }
});

test('DOCUMENT_TYPES lists the five types with label and size', () => {
    assert.deepEqual(DOCUMENT_TYPES, {
        quote: { label: 'Quote', size: 'letter' },
        order: { label: 'Order', size: 'letter' },
        invoice: { label: 'Invoice', size: 'letter' },
        packing: { label: 'PackingList', size: 'letter' },
        shipping: { label: 'Shipping', size: '4x6' },
    });
});

test('renderDocumentHtml dispatches by type', () => {
    const data = build();
    assert.match(renderDocumentHtml('quote', data), /<title>Quote 13706QWD/);
    assert.match(renderDocumentHtml('order', data), /<title>Order 13706QWD/);
    assert.match(renderDocumentHtml('invoice', data), /Total due/);
    assert.match(renderDocumentHtml('packing', data), /Qty shipped/);
    assert.match(renderDocumentHtml('shipping', data), /size:\s*4in 6in/);
});

test('renderDocumentHtml throws UNKNOWN_TYPE for an unknown type', () => {
    assert.throws(() => renderDocumentHtml('bogus', build()), (err) => err.code === 'UNKNOWN_TYPE');
});

test('letter documents keep the letter page with 0.5in margin', () => {
    for (const html of [invoiceHtml(build()), packingHtml(build())]) {
        assert.match(html, /<body class="letter">/);
        assert.match(html, /@page letter\s*{\s*size:\s*Letter;\s*margin:\s*0\.5in/);
    }
});

test('invoice tax row is plain Tax with $0.00 when tax flag is N', () => {
    const html = invoiceHtml(build({ tax_code: 0, tax_percent: 10 }));
    assert.match(html, /<td>Tax<\/td><td class="n">\$0\.00</);
    assert.ok(!html.includes('10%'));
});
