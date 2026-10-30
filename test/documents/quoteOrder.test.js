const test = require('node:test');
const assert = require('node:assert/strict');
const { documentData } = require('../../src/lib/documents/data');
const { escapeHtml, money, page } = require('../../src/lib/documents/layout');
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

test('money formats two decimals', () => {
    assert.equal(money(31.5), '31.50');
    assert.equal(money(0), '0.00');
});

test('page uses letter or 4in 6in @page size', () => {
    assert.match(page('T', '<p>x</p>'), /@page\s*{\s*size:\s*letter/);
    assert.match(page('T', '<p>x</p>', { size: '4in 6in' }), /@page\s*{\s*size:\s*4in 6in/);
});

test('quoteHtml has header, To block, quote number, date, prepared by and parts', () => {
    const html = quoteHtml(build());
    assert.match(html, /^<!DOCTYPE html>/);
    for (const text of [
        'Leemac Manufacturing Inc.', '1980 Hartog Drive, San Jose CA 95131', '(408)573-0130', '(408)573-0131',
        'WD Media', '1 Main St', 'San Jose CA', 'Attn. Bob', '13706QWD', '01-05-2026',
        'Justin Shin', '408-717-6241', '669-369-8895', 'P-1', 'Bracket', 'Anodize', '10.00',
    ]) {
        assert.ok(html.includes(text), `missing ${text}`);
    }
    assert.match(html, /size:\s*letter/);
    assert.ok(!html.includes('Customer Order Number'));
});

test('orderHtml has ship/sold to, PO fields, tax, ship via and parts', () => {
    const html = orderHtml(build());
    for (const text of [
        'Leemac Manufacturing Inc.', 'Ship to', 'Sold to', 'WD Media', 'Reference #', '13706QWD',
        'Customer Order Number', 'PO-9', '01-06-2026', '12-25-2026', 'LEEMAC', 'P-1', 'Bracket',
    ]) {
        assert.ok(html.includes(text), `missing ${text}`);
    }
    assert.match(html, /Tax[^<]*<\/[^>]+>\s*<[^>]+>Y</);
    assert.match(html, /size:\s*letter/);
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
