const test = require('node:test');
const assert = require('node:assert/strict');
const { makeFakeDb } = require('../helpers/fakeDb');
const { loadJobSummary } = require('../../src/lib/jobSummary');
const { documentData, formFromSummary, dataFromForm, LEEMAC, DEFAULT_LEADTIME } = require('../../src/lib/documents/data');

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
    po_date: new Date(2026, 0, 6),
    due_date: new Date(2026, 11, 25),
    invoice_date: new Date(2026, 1, 3),
    ship_date: new Date(2026, 1, 9),
    invoice_clicked_at: new Date(2026, 1, 12, 15, 30),
    leadtime: '2 weeks',
    tax_code: 0,
    tax: 0,
    tax_percent: 0,
    ...overrides,
});

const part = (overrides = {}) => ({
    number: 'P-1',
    rev: 'A',
    description: 'Bracket',
    details: 'Anodize',
    quantity: 3,
    price: '10.50',
    ...overrides,
});

test('builds customer, reference, MM-DD-YYYY dates and ship date from invoice_clicked_at', () => {
    const d = documentData({ job: job(), parts: [part()] });
    assert.deepEqual(d.customer, {
        name: 'WD Media',
        line1: '1 Main St',
        line2: 'San Jose CA',
        attention: 'Bob',
    });
    assert.equal(d.reference, '13706QWD');
    assert.deepEqual(d.dates, {
        created: '01-05-2026',
        po: '01-06-2026',
        due: '12-25-2026',
        invoice: '02-03-2026',
        ship: '02-12-2026',
    });
    assert.equal(d.poNumber, 'PO-9');
    assert.equal(d.invoiceNumber, '10796');
});

test('null dates become empty strings', () => {
    const d = documentData({
        job: job({ po_date: null, due_date: null, invoice_date: null, invoice_clicked_at: null }),
        parts: [],
    });
    assert.deepEqual([d.dates.po, d.dates.due, d.dates.invoice, d.dates.ship], ['', '', '', '']);
});

test('parts get item numbers, ext price, rev dash and material/finish details fallback', () => {
    const d = documentData({
        job: job(),
        parts: [
            part(),
            part({ number: 'P-2', rev: null, details: null, material: '6061', finish: 'Black', quantity: 2, price: 4 }),
        ],
    });
    assert.deepEqual(d.parts[0], {
        item: 1, number: 'P-1', rev: 'A', description: 'Bracket',
        details: 'Anodize', quantity: 3, price: 10.5, ext: 31.5,
    });
    assert.equal(d.parts[1].item, 2);
    assert.equal(d.parts[1].rev, '—');
    assert.equal(d.parts[1].details, '*6061 *Black');
    assert.equal(d.parts[1].ext, 8);
    assert.equal(d.subtotal, 39.5);
    assert.equal(d.total, 39.5);
});

test('has no part cap', () => {
    const parts = Array.from({ length: 12 }, (_, i) => part({ number: `P-${i}`, quantity: 1, price: 1 }));
    const d = documentData({ job: job(), parts });
    assert.equal(d.parts.length, 12);
    assert.equal(d.parts[11].item, 12);
    assert.equal(d.subtotal, 12);
});

test('tax uses job.tax when set, and adds to total', () => {
    const d = documentData({
        job: job({ tax_code: 1, tax: '5.25', tax_percent: 8 }),
        parts: [part({ quantity: 1, price: 100 })],
    });
    assert.deepEqual(d.tax, { flag: 'Y', amount: 5.25, percent: 8 });
    assert.equal(d.total, 105.25);
});

test('tax falls back to subtotal x tax_percent / 100', () => {
    const d = documentData({
        job: job({ tax_code: 1, tax: 0, tax_percent: 8 }),
        parts: [part({ quantity: 1, price: 100 })],
    });
    assert.deepEqual(d.tax, { flag: 'Y', amount: 8, percent: 8 });
    assert.equal(d.total, 108);
});

test('tax flag is N and amount 0 when tax_code is not 1 or no tax is set', () => {
    const parts = [part({ quantity: 1, price: 100 })];
    const off = documentData({ job: job({ tax_code: 0, tax: 5, tax_percent: 8 }), parts });
    assert.deepEqual(off.tax, { flag: 'N', amount: 0, percent: 8 });
    assert.equal(off.total, 100);
    const none = documentData({ job: job({ tax_code: 1 }), parts });
    assert.deepEqual(none.tax, { flag: 'N', amount: 0, percent: 0 });
});

test('tax percent is a number, 0 when absent', () => {
    const str = documentData({ job: job({ tax_percent: '8.5' }), parts: [] });
    assert.strictEqual(str.tax.percent, 8.5);
    const absent = documentData({ job: job({ tax_percent: undefined }), parts: [] });
    assert.strictEqual(absent.tax.percent, 0);
});

test('exports Leemac constants', () => {
    assert.equal(LEEMAC.shipVia, 'Leemac delivery');
    assert.equal(LEEMAC.preparedBy, 'Justin Shin');
    assert.equal(LEEMAC.phone, '(408) 573-0130');
    assert.equal(LEEMAC.fax, '(408) 573-0131');
    assert.equal(LEEMAC.tel, '408-717-6241');
    assert.equal(LEEMAC.cell, '669-369-8895');
    assert.equal(LEEMAC.email, 'leemac@leemac.co');
    assert.equal(LEEMAC.street, '1980 Hartog Drive');
    assert.equal(LEEMAC.city, 'San Jose, CA 95131');
    assert.equal(LEEMAC.terms, 'Net 30 days');
});

test('loadJobSummary selects job.leadtime and job.invoice_clicked_at', async () => {
    const db = makeFakeDb([{ match: /FROM job\s+JOIN company/, rows: [{}] }]);
    await loadJobSummary(db, 1);
    assert.match(db.calls[0].sql, /job\.leadtime/);
    assert.match(db.calls[0].sql, /job\.invoice_clicked_at/);
});

test('formFromSummary leadtime is the trimmed job leadtime, or the default when blank', () => {
    assert.equal(DEFAULT_LEADTIME, '3 weeks');
    const lead = (leadtime) => formFromSummary({ job: job({ leadtime }), parts: [] }).fields.leadtime;
    assert.equal(lead(' 2 weeks '), '2 weeks');
    for (const blank of [null, undefined, '', '   ']) assert.equal(lead(blank), '3 weeks');
});

test('ship date comes only from invoice_clicked_at, never ship_date or invoice_date', () => {
    const ship = (o) => formFromSummary({ job: job(o), parts: [] }).fields.dates.ship;
    assert.equal(ship({ invoice_clicked_at: null }), '');
    assert.equal(ship({ invoice_clicked_at: undefined }), '');
    assert.equal(ship({}), '02-12-2026');
});

test('dataFromForm passes leadtime through unchanged', () => {
    const { fields } = formFromSummary({ job: job(), parts: [] });
    assert.equal(dataFromForm({ fields: { ...fields, leadtime: ' 5 days' }, parts: [] }).leadtime, ' 5 days');
});

test('formFromSummary returns editable fields and the six part columns', () => {
    const form = formFromSummary({
        job: job({ tax_code: 1, tax: '5.25', tax_percent: 8 }),
        parts: [part({ rev: null, details: null, material: '6061', finish: 'Black', price: '4' })],
    });
    assert.deepEqual(form.fields, {
        customer: { name: 'WD Media', line1: '1 Main St', line2: 'San Jose CA', attention: 'Bob' },
        reference: '13706QWD',
        dates: { created: '01-05-2026', po: '01-06-2026', due: '12-25-2026', invoice: '02-03-2026', ship: '02-12-2026' },
        leadtime: '2 weeks',
        poNumber: 'PO-9',
        invoiceNumber: '10796',
        tax: { flag: 'Y', percent: 8, amount: 5.25 },
    });
    assert.deepEqual(form.parts, [
        { number: 'P-1', rev: '—', description: 'Bracket', details: '*6061 *Black', quantity: 3, price: '4' },
    ]);
});

test('formFromSummary tax amount is 0 when the job has no flat tax', () => {
    const form = formFromSummary({ job: job({ tax: undefined }), parts: [] });
    assert.strictEqual(form.fields.tax.amount, 0);
});

test('dataFromForm numbers items, coerces strings and computes tax and total', () => {
    const { fields } = formFromSummary({ job: job(), parts: [] });
    const parts = [
        { number: 'A', rev: 'A', description: 'd', details: 'x', quantity: '2', price: '50' },
        { number: 'B', rev: 'A', description: 'd', details: 'x', quantity: '1', price: '100' },
    ];
    const pct = dataFromForm({ fields: { ...fields, tax: { flag: 'Y', percent: 10, amount: 0 } }, parts });
    assert.deepEqual(pct.parts.map((p) => [p.item, p.quantity, p.price, p.ext]), [[1, 2, 50, 100], [2, 1, 100, 100]]);
    assert.equal(pct.subtotal, 200);
    assert.deepEqual(pct.tax, { flag: 'Y', percent: 10, amount: 20 });
    assert.equal(pct.total, 220);
    const flat = dataFromForm({ fields: { ...fields, tax: { flag: 'Y', percent: 10, amount: '7' } }, parts });
    assert.equal(flat.tax.amount, 7);
    const off = dataFromForm({ fields: { ...fields, tax: { flag: 'N', percent: 10, amount: 7 } }, parts });
    assert.equal(off.tax.amount, 0);
    assert.equal(off.total, 200);
});

test('documentData equals dataFromForm(formFromSummary) for taxed, flat-taxed and untaxed jobs', () => {
    for (const o of [{ tax_code: 1, tax_percent: 8 }, { tax_code: 1, tax: 5.25, tax_percent: 8 }, {}]) {
        const summary = { job: job(o), parts: [part(), part({ number: 'P-2', quantity: 2, price: 4 })] };
        assert.deepEqual(documentData(summary), dataFromForm(formFromSummary(summary)));
    }
});
