const test = require('node:test');
const assert = require('node:assert/strict');
const { documentData, LEEMAC } = require('../../src/lib/documents/data');
const { escapeHtml } = require('../../src/lib/documents/layout');
const { quoteHtml } = require('../../src/lib/documents/quote');
const { orderHtml } = require('../../src/lib/documents/order');

const build = (jobOverrides = {}, parts) => documentData({
    job: {
        job_number: 13706,
        company_code: 'QWD',
        company_name: 'WD Media',
        address_line1: '1 Main St',
        address_line2: 'San Jose CA',
        attention: 'Bob',
        po_number: 'PO-9',
        invoice_number: '',
        created_at: new Date(2026, 0, 5),
        po_date: new Date(2026, 0, 6),
        due_date: new Date(2026, 11, 25),
        tax_code: 1,
        tax: 0,
        tax_percent: 10,
        ...jobOverrides,
    },
    parts: parts || [{ number: 'P-1', rev: 'A', description: 'Bracket', details: 'Anodize', quantity: 2, price: 5 }],
});

test('escapeHtml escapes the five special characters', () => {
    assert.equal(escapeHtml(`<a href="x">&'`), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;');
});

const text = (html) => html.replace(/<[^>]+>/g, '|').replace(/\|+/g, '|');

test('quoteHtml shows masthead, To party, Quote total headline, facts, lines, prepared by and total', () => {
    const html = quoteHtml(build({ tax_code: 1, tax: 0, tax_percent: 10 }));
    assert.match(html, /^<!DOCTYPE html>/);
    const t = text(html);
    for (const expected of [
        LEEMAC.name, LEEMAC.street, '<h1>Quote</h1>', 'Quote #', '13706QWD',
        'To', 'WD Media', '1 Main St', 'San Jose CA', 'Attn', 'Bob',
        'Quote total', '$10.00', '1 lines · 2 pcs',
        'Date', 'Jan 5, 2026', 'Leadtime', '3 weeks',
        'P-1', 'Bracket', 'Anodize', '$5.00',
        'Prepared by', LEEMAC.preparedBy, LEEMAC.tel, LEEMAC.cell, 'Total',
    ]) {
        assert.ok(html.includes(expected) || t.includes(expected), `missing ${expected}`);
    }
    assert.ok(html.includes('<meta name="doc-footer" content="Quote 13706QWD">'));
    assert.ok(!html.includes('Tax'));
    assert.ok(!html.includes('PO number'));
});

test('orderHtml shows facts, tax rows, total headline and footer with PO', () => {
    const html = orderHtml(build({ tax: 0, tax_percent: 10 }));
    const expectedFacts = [
        ['PO date', 'Jan 6, 2026'], ['Reference #', '13706QWD'], ['PO number', 'PO-9'], ['Due date', 'Dec 25, 2026'],
        ['Tax code', 'Y (taxable)'], ['Leadtime', '3 weeks'], ['Ship via', LEEMAC.shipVia],
    ];
    for (const [k, v] of expectedFacts) {
        assert.ok(html.includes(`<div class="label">${k}</div><div class="value">${v}</div>`), `missing fact ${k}`);
    }
    assert.ok(html.includes('<h1>Order</h1>'));
    assert.ok(html.includes('<td>Subtotal</td><td class="n">$10.00</td>'));
    assert.ok(html.includes('<td>Tax 10%</td><td class="n">$1.00</td>'));
    assert.ok(html.includes('<tr class="grand"><td>Total</td><td class="n">$11.00</td></tr>'));
    assert.ok(html.includes('Order total'));
    assert.ok(html.includes(`content="Order 13706QWD \u00b7 PO PO-9"`));
    assert.ok(html.includes('WD Media'));
    assert.ok(!html.includes('Delivered By') && !html.includes('Special Instructions'));
});

test('orderHtml uses the flat tax amount and a plain Tax label for non-taxable jobs', () => {
    const flat = orderHtml(build({ tax: 3.5 }));
    assert.ok(flat.includes('<td>Tax</td><td class="n">$3.50</td>'));
    assert.ok(!flat.includes('Tax 10%'));
    assert.ok(flat.includes('<td>Total</td><td class="n">$13.50</td>'));
    const none = orderHtml(build({ tax_code: 0 }));
    assert.ok(none.includes('<td>Tax</td><td class="n">$0.00</td>'));
    assert.ok(none.includes('<div class="value">N</div>'));
    assert.ok(none.includes('<td>Total</td><td class="n">$10.00</td>'));
});

test('blank attention and PO number leave no Attn or PO number label', () => {
    const data = build({ attention: '', po_number: '' });
    const quote = quoteHtml(data);
    const order = orderHtml(data);
    assert.ok(!quote.includes('Attn'));
    assert.ok(!order.includes('Attn'));
    assert.ok(!order.includes('PO number'));
    assert.ok(order.includes('content="Order 13706QWD"'));
});

test('both documents render all 12 parts', () => {
    const parts = Array.from({ length: 12 }, (_, i) => ({
        number: `PN-${i + 1}`, rev: 'A', description: 'd', details: 'x', quantity: 1, price: 1,
    }));
    const data = build({}, parts);
    for (const html of [quoteHtml(data), orderHtml(data)]) {
        for (let i = 1; i <= 12; i++) assert.ok(html.includes(`PN-${i}<`), `missing PN-${i}`);
    }
});

test('job values are HTML-escaped in both documents', () => {
    const data = build(
        { company_name: '<script>alert(1)</script>', attention: '<script>a</script>', po_number: '<script>p</script>' },
        [{ number: '<script>n</script>', rev: 'A', description: '<script>d</script>', details: '<script>x</script>', quantity: 1, price: 1 }],
    );
    for (const html of [quoteHtml(data), orderHtml(data)]) {
        assert.ok(!html.includes('<script>'));
        assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
    }
});
