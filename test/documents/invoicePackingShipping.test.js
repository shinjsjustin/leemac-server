const test = require('node:test');
const assert = require('node:assert/strict');
const { documentData } = require('../../src/lib/documents/data');
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

test('invoiceHtml shows addresses, invoice fields, tax, totals, term and ship via', () => {
    const html = invoiceHtml(build());
    assert.match(html, /^<!DOCTYPE html>/);
    hasAll(html, [
        'Leemac Manufacturing Inc.', 'Bill to', 'Ship to', 'WD Media', '1 Main St', 'Attn: Account Payable',
        'Attn. Bob', 'INV-77', '02-07-2026', '02-08-2026', 'PO-9', '13706QWD', 'TAX', '1.00',
        'SUBTOTAL', '10.00', 'TOTAL TO REMIT', '11.00', 'NET 30 DAYS', 'LEEMAC', 'P-1', 'Bracket', 'Anodize',
    ]);
    assert.match(html, /size:\s*letter/);
});

test('packingHtml shows ship/sold to, refs and qty ordered, shipped and balance 0', () => {
    const html = packingHtml(build({}, [
        { number: 'P-1', rev: 'A', description: 'Bracket', details: 'x', quantity: 7, price: 5 },
    ]));
    hasAll(html, [
        'Ship to', 'Sold to', 'WD Media', 'Ref #', '13706QWD', 'PO-9', 'Invoice#', 'INV-77',
        'SHIP DATE', '02-08-2026', 'P-1', 'Bracket',
    ]);
    assert.match(html, /<td class="num">7<\/td>\s*<td class="num">7<\/td>\s*<td class="num">0<\/td>/);
    assert.match(html, /size:\s*letter/);
});

test('shippingHtml is a 4in 6in label with From, To, refs and parts', () => {
    const html = shippingHtml(build({}, [
        { number: 'P-1', rev: 'A', description: 'Bracket', details: 'Anodize', quantity: 2, price: 5 },
        { number: 'P-2', rev: 'A', description: 'Plate', details: 'Raw', quantity: 9, price: 1 },
    ]));
    assert.match(html, /@page\s*{\s*size:\s*4in 6in/);
    hasAll(html, [
        'From', 'Leemac', 'Manufacturing', '1980 Hartog Drive', 'To', 'WD Media', '1 Main St', 'Attn. Bob',
        'Quote: 13706QWD', 'PO: PO-9', 'Invoice: INV-77', 'P-1', 'Bracket', 'Anodize', 'P-2', 'Plate', 'Raw',
    ]);
    assert.match(html, /P-2[\s\S]*?\b9\b/);
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
    assert.match(renderDocumentHtml('invoice', data), /TOTAL TO REMIT/);
    assert.match(renderDocumentHtml('packing', data), /SHIP DATE/);
    assert.match(renderDocumentHtml('shipping', data), /size:\s*4in 6in/);
});

test('renderDocumentHtml throws UNKNOWN_TYPE for an unknown type', () => {
    assert.throws(() => renderDocumentHtml('bogus', build()), (err) => err.code === 'UNKNOWN_TYPE');
});

test('invoice tax line reads TAX <percent>% and the amount', () => {
    assert.match(invoiceHtml(build({ tax_percent: 10 })), /TAX 10% 1\.00/);
    assert.match(invoiceHtml(build({ tax_percent: 8.5 })), /TAX 8\.5% 0\.85/);
});

test('packing Sold to ends with Attn: Account Payable and Ship to keeps the attention', () => {
    const html = packingHtml(build());
    assert.match(html, /Ship to:<br>[^]*?Attn\. Bob/);
    assert.match(html, /Sold to:<br>(?:(?!<\/td>)[^])*?Attn: Account Payable<\/td>/);
});

test('shipping From uses LEEMAC name and address with a 0.15in margin; letter keeps 0.5in', () => {
    const label = shippingHtml(build());
    assert.ok(label.includes('Leemac Manufacturing Inc.'));
    assert.ok(label.includes('1980 Hartog Drive, San Jose CA 95131'));
    assert.match(label, /size:\s*4in 6in;\s*margin:\s*0\.15in/);
    assert.match(invoiceHtml(build()), /size:\s*letter;\s*margin:\s*0\.5in/);
});
