const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSheetUpdates, populateSheet } = require('../../src/lib/quoteSheet');

const baseJob = {
    job_number: 1001,
    company_code: 'ACME',
    company_name: 'Acme Co',
    address_line1: '1 Main St',
    address_line2: 'Town, ST 11111',
    attention: 'Bob',
    created_at: '2024-03-05T12:00:00',
    po_number: null,
    po_date: null,
    due_date: '2024-04-01T12:00:00',
    invoice_number: null,
    invoice_date: null,
};

const common = (taxFlag) => [
    { cell: 'B5', value: 1001 },
    { cell: 'B6', value: 'ACME' },
    { cell: 'B9', value: 'Acme Co' },
    { cell: 'B10', value: '1 Main St' },
    { cell: 'B11', value: 'Town, ST 11111' },
    { cell: 'B13', value: 'Bob' },
    { cell: 'B14', value: '03-05-2024' },
    { cell: 'B16', value: '' },
    { cell: 'B17', value: '—' },
    { cell: 'B18', value: '04-01-2024' },
    { cell: 'B19', value: taxFlag },
];
const tail = [
    { cell: 'B23', value: '—' },
    { cell: 'B24', value: '—' },
    { cell: 'B25', value: '—' },
];

test('writes the tax amount in B20 when tax_code is 1 and tax is positive', () => {
    const job = { ...baseJob, tax_code: 1, tax: 50, tax_percent: 5 };
    assert.deepEqual(buildSheetUpdates(job, []), [
        ...common('Y'), { cell: 'B20', value: 50 }, ...tail,
    ]);
});

test('writes the tax percent as a decimal in B21 when tax is zero', () => {
    const job = { ...baseJob, tax_code: 1, tax: 0, tax_percent: 8 };
    assert.deepEqual(buildSheetUpdates(job, []), [
        ...common('Y'), { cell: 'B21', value: 0.08 }, ...tail,
    ]);
});

test('writes N and no tax cell when tax_code is not 1', () => {
    const job = { ...baseJob, tax_code: 0, tax: 50, tax_percent: 8 };
    assert.deepEqual(buildSheetUpdates(job, []), [...common('N'), ...tail]);
});

const partCells = (updates) => updates.filter(({ cell }) => parseInt(cell.slice(1), 10) >= 27);
const noTax = { ...baseJob, tax_code: 0 };

test('writes parts in 7-row blocks from row 27 with a numeric price', () => {
    const parts = [
        { number: "'A1", rev: null, description: null, details: 'bare', quantity: 3, price: '12.50' },
        { number: 'B2', rev: 'C', description: 'Bracket', details: 'x', quantity: 1, price: 4 },
    ];
    assert.deepEqual(partCells(buildSheetUpdates(noTax, parts)), [
        { cell: 'B27', value: 'A1' },
        { cell: 'B28', value: '—' },
        { cell: 'B29', value: '—' },
        { cell: 'B30', value: 'bare' },
        { cell: 'B31', value: 3 },
        { cell: 'B32', value: 12.5 },
        { cell: 'B34', value: 'B2' },
        { cell: 'B35', value: 'C' },
        { cell: 'B36', value: 'Bracket' },
        { cell: 'B37', value: 'x' },
        { cell: 'B38', value: 1 },
        { cell: 'B39', value: 4 },
    ]);
});

test('keeps a null price null', () => {
    const parts = [{ number: 'A', details: 'd', quantity: 1, price: null }];
    assert.equal(partCells(buildSheetUpdates(noTax, parts))[5].value, null);
});

test('uses *material *finish when details are empty', () => {
    const detailsOf = (part) => partCells(buildSheetUpdates(noTax, [part]))[3].value;
    assert.equal(detailsOf({ number: 'A', details: '', material: 'Steel', finish: 'Zinc', price: 1 }), '*Steel *Zinc');
    assert.equal(detailsOf({ number: 'A', details: null, material: 'Steel', finish: '', price: 1 }), '*Steel');
    assert.equal(detailsOf({ number: 'A', details: 'keep', material: 'Steel', finish: 'Zinc', price: 1 }), 'keep');
});

test('populateSheet clears B5:B96, applies updates and saves', async () => {
    const calls = [];
    const cells = new Map();
    const sheet = {
        loadCells: async (range) => calls.push(`load ${range}`),
        getCell: (row, col) => {
            const key = `${row},${col}`;
            if (!cells.has(key)) cells.set(key, { value: 'old' });
            return cells.get(key);
        },
        saveUpdatedCells: async () => calls.push(`save b5=${cells.get('4,1').value} b6=${cells.get('5,1').value}`),
    };
    await populateSheet(sheet, { ...noTax }, []);
    assert.deepEqual(calls, ['load B5:B96', 'save b5=null b6=null', 'save b5=1001 b6=ACME']);
    assert.equal(cells.get('4,1').value, 1001);
    assert.equal(cells.get('95,1').value, null);
    assert.equal(cells.size, 92);
});
