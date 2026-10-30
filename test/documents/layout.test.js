const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../../src/lib/documents/layout');

test('usd formats dollars with grouping and two decimals', () => {
    assert.equal(L.usd(1234.5), '$1,234.50');
    assert.equal(L.usd(0), '$0.00');
});

test('longDate formats MM-DD-YYYY, blank gives empty, unparseable is returned as typed', () => {
    assert.equal(L.longDate('10-30-2026'), 'Oct 30, 2026');
    assert.equal(L.longDate('01-05-2026'), 'Jan 5, 2026');
    assert.equal(L.longDate(''), '');
    assert.equal(L.longDate(undefined), '');
    assert.equal(L.longDate('soon'), 'soon');
});

test('addDays adds days to MM-DD-YYYY and returns empty when unparseable', () => {
    assert.equal(L.addDays('10-30-2026', 30), '11-29-2026');
    assert.equal(L.addDays('12-15-2026', 30), '01-14-2027');
    assert.equal(L.addDays('', 30), '');
    assert.equal(L.addDays('soon', 30), '');
});

test('docPage inlines docs.css, sets body class and writes footer meta only when non-empty', () => {
    const html = L.docPage('T <1>', 'Quote "7"', '<p>x</p>');
    assert.match(html, /<style>[\s\S]*\.masthead[\s\S]*<\/style>/);
    assert.ok(!html.includes('<link'));
    assert.match(html, /<body class="letter">/);
    assert.match(html, /<title>T &lt;1&gt;<\/title>/);
    assert.match(html, /<meta name="doc-footer" content="Quote &quot;7&quot;">/);
    const label = L.docPage('S', '', '<p>x</p>', 'label-doc');
    assert.match(label, /<body class="label-doc">/);
    assert.ok(!label.includes('doc-footer'));
});

test('masthead embeds the logo as a data URI with no external URL', () => {
    const html = L.masthead('Quote', 'Quote #', '13742QNO');
    assert.match(html, /<img src="data:image\/svg\+xml;base64,[A-Za-z0-9+/=]+"/);
    assert.ok(!/https?:|file:/.test(html));
    assert.ok(html.includes('1980 Hartog Drive, San Jose, CA 95131'));
    assert.ok(html.includes('<h1>Quote</h1>'));
    assert.ok(html.includes('13742QNO'));
});

test('facts drops entries with empty values', () => {
    const html = L.facts([['Date', 'Oct 30, 2026'], ['PO number', ''], ['Ship via', undefined]]);
    assert.ok(html.includes('Date'));
    assert.ok(!html.includes('PO number'));
    assert.ok(!html.includes('Ship via'));
});

test('party drops empty lines and the Attn row when blank', () => {
    const co = { name: 'Acme', line1: '1 Main', line2: '' };
    const html = L.party('To', co, '');
    assert.ok(html.includes('1 Main'));
    assert.equal((html.match(/<div>/g) || []).length, 1);
    assert.ok(!html.includes('Attn'));
    assert.ok(L.party('To', co, 'Bob').includes('<b>Attn</b> Bob'));
});

test('headline shows sub only when given', () => {
    assert.ok(L.headline('Total', '$1.00', '2 lines').includes('class="sub">2 lines'));
    assert.ok(!L.headline('Total', '$1.00').includes('class="sub"'));
});

test('lines renders prices only when asked, with dash for blank rev', () => {
    const parts = [{ number: 'A-1', rev: '', description: 'Bracket', details: '*AL', quantity: 2, price: 1500 }];
    const priced = L.lines(parts, { prices: true });
    assert.ok(priced.includes('$1,500.00') && priced.includes('$3,000.00'));
    assert.ok(priced.includes('—') && priced.includes('class="details">*AL'));
    const plain = L.lines(parts, { prices: false, qtyLabel: 'Qty shipped' });
    assert.ok(plain.includes('Qty shipped'));
    assert.ok(!plain.includes('Unit price') && !plain.includes('$'));
});

test('totalsTable marks the grand row', () => {
    const html = L.totalsTable([['Subtotal', '$1.00'], ['Total', '$1.00', true]]);
    assert.equal((html.match(/class="grand"/g) || []).length, 1);
});

test('note and preparedBy render label and Leemac contact', () => {
    assert.ok(L.note('Remit to', '<b>x</b>').includes('<div class="label">Remit to</div><b>x</b>'));
    const p = L.preparedBy();
    assert.ok(p.includes('Justin Shin') && p.includes('408-717-6241') && p.includes('669-369-8895'));
});

test('old layout exports still work', () => {
    for (const k of ['escapeHtml', 'money', 'page', 'header', 'partsTable']) assert.equal(typeof L[k], 'function');
});

test('taxLabel names the percent only when the amount matches it', () => {
    const cases = [
        [{ flag: 'Y', percent: 10, amount: 1 }, 10, 'Tax 10%'],
        [{ flag: 'Y', percent: 10, amount: 1.004 }, 10, 'Tax 10%'],
        [{ flag: 'Y', percent: 10, amount: 3.5 }, 10, 'Tax'],
        [{ flag: 'Y', percent: 10, amount: 1.01 }, 10, 'Tax'],
        [{ flag: 'N', percent: 10, amount: 1 }, 10, 'Tax'],
        [{ flag: 'Y', percent: 0, amount: 0 }, 10, 'Tax'],
    ];
    for (const [tax, subtotal, expected] of cases) assert.equal(L.taxLabel(tax, subtotal), expected);
});
