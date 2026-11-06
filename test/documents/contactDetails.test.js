const test = require('node:test');
const assert = require('node:assert/strict');
const { documentData } = require('../../src/lib/documents/data');
const { renderDocumentHtml } = require('../../src/lib/documents');
const { preparedBy } = require('../../src/lib/documents/layout');

const EMAIL = 'leemac@leemac.co';
const PHONE = '(650) 787-8483';
const DEAD = ['(408) 573-0130', '(408) 573-0131', '408-717-6241', '669-369-8895', 'Fax'];

const data = documentData({
    job: {
        job_number: 13706, company_code: 'QWD', company_name: 'WD Media',
        address_line1: '1 Main St', address_line2: 'San Jose CA', attention: 'Bob',
        po_number: 'PO-9', invoice_number: 'INV-77',
        created_at: new Date(2026, 0, 5), invoice_date: new Date(2026, 1, 7),
        ship_date: new Date(2026, 1, 8), invoice_clicked_at: new Date(2026, 1, 8),
        tax_code: 1, tax: 0, tax_percent: 10,
    },
    parts: [{ number: 'P-1', rev: 'A', description: 'Bracket', details: 'Anodize', quantity: 2, price: 5 }],
});

for (const type of ['quote', 'order', 'invoice', 'packing', 'shipping']) {
    test(`${type} shows the email before the phone and no dead numbers`, () => {
        const html = renderDocumentHtml(type, data);
        const email = html.indexOf(EMAIL);
        assert.ok(email >= 0, 'email missing');
        assert.ok(html.indexOf(PHONE) > email, 'phone must follow email');
        for (const dead of DEAD) assert.ok(!html.includes(dead), `found ${dead}`);
    });
}

test('preparedBy reads name, then email, then phone', () => {
    const p = preparedBy();
    const [name, email, phone] = ['Justin Shin', EMAIL, PHONE].map((s) => p.indexOf(s));
    assert.ok(name >= 0 && name < email && email < phone);
});
