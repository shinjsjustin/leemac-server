const { test } = require('node:test');
const assert = require('node:assert');
const { makeFakeDb } = require('../helpers/fakeDb');
const { PoError, validatePoFields, updateJobPo } = require('../../src/lib/jobPo');

const VALID = { po_number: 'PO1', po_date: '2026-01-02', due_date: null, tax_code: 1, tax: 0, tax_percent: 0 };

test('updateJobPo without onlyPresent sets the four main columns and skips zero tax', async () => {
    const db = makeFakeDb();
    await updateJobPo(db, 7, VALID);
    assert.strictEqual(db.calls[0].sql, 'UPDATE job SET po_number = ?, po_date = ?, due_date = ?, tax_code = ? WHERE id = ?');
    assert.deepStrictEqual(db.calls[0].params, ['PO1', '2026-01-02', null, 1, 7]);
});

test('updateJobPo without onlyPresent adds tax and tax_percent when above 0', async () => {
    const db = makeFakeDb();
    await updateJobPo(db, 7, { ...VALID, tax: 5, tax_percent: 8 });
    assert.strictEqual(db.calls[0].sql, 'UPDATE job SET po_number = ?, po_date = ?, due_date = ?, tax_code = ?, tax = ?, tax_percent = ? WHERE id = ?');
    assert.deepStrictEqual(db.calls[0].params, ['PO1', '2026-01-02', null, 1, 5, 8, 7]);
});

test('updateJobPo with onlyPresent sets only the given keys', async () => {
    const db = makeFakeDb();
    await updateJobPo(db, 7, { po_number: 'PO9' }, { onlyPresent: true });
    assert.strictEqual(db.calls[0].sql, 'UPDATE job SET po_number = ? WHERE id = ?');
    assert.deepStrictEqual(db.calls[0].params, ['PO9', 7]);
});

test('updateJobPo with onlyPresent keeps null and zero values and ignores unknown keys', async () => {
    const db = makeFakeDb();
    await updateJobPo(db, 7, { due_date: null, tax: 0, bogus: 1 }, { onlyPresent: true });
    assert.strictEqual(db.calls[0].sql, 'UPDATE job SET due_date = ?, tax = ? WHERE id = ?');
    assert.deepStrictEqual(db.calls[0].params, [null, 0, 7]);
});

test('updateJobPo with onlyPresent throws 400 when no fields are present', async () => {
    const db = makeFakeDb();
    await assert.rejects(updateJobPo(db, 7, { bogus: 1 }, { onlyPresent: true }),
        (e) => e instanceof PoError && e.status === 400);
    assert.strictEqual(db.calls.length, 0);
});

test('validatePoFields accepts a valid body', () => {
    assert.doesNotThrow(() => validatePoFields(VALID));
    assert.doesNotThrow(() => validatePoFields({ ...VALID, po_number: ' ' + 'x'.repeat(50) + ' ' }));
});

const BAD = {
    'missing po_number': { ...VALID, po_number: undefined },
    'blank po_number': { ...VALID, po_number: '   ' },
    'non-string po_number': { ...VALID, po_number: 5 },
    'long po_number': { ...VALID, po_number: 'x'.repeat(51) },
    'bad po_date': { ...VALID, po_date: '01/02/2026' },
    'bad due_date': { ...VALID, due_date: '2026-1-2' },
    'tax_code 2': { ...VALID, tax_code: 2 },
    'negative tax': { ...VALID, tax: -1 },
    'negative tax_percent': { ...VALID, tax_percent: -0.5 },
    'non-numeric tax': { ...VALID, tax: 'abc' },
};
for (const [name, body] of Object.entries(BAD)) {
    test(`validatePoFields rejects ${name} with status 400`, () => {
        assert.throws(() => validatePoFields(body), (e) => e instanceof PoError && e.status === 400);
    });
}

test('validatePoFields returns a new object of known keys with po_number trimmed', () => {
    const body = { ...VALID, po_number: '  PO7  ', bogus: 1 };
    const out = validatePoFields(body);
    assert.deepStrictEqual(out, { ...VALID, po_number: 'PO7' });
    assert.strictEqual(body.po_number, '  PO7  ');
});

test('validatePoFields partial accepts a single field and returns only it', () => {
    assert.deepStrictEqual(validatePoFields({ due_date: '2026-02-01' }, { partial: true }), { due_date: '2026-02-01' });
});

test('validatePoFields partial trims po_number when present', () => {
    assert.deepStrictEqual(validatePoFields({ po_number: ' A ' }, { partial: true }), { po_number: 'A' });
});

test('validatePoFields partial rejects a body with no PO fields with status 400', () => {
    assert.throws(() => validatePoFields({ bogus: 1 }, { partial: true }), (e) => e instanceof PoError && e.status === 400);
});

test('validatePoFields partial still rejects invalid present fields', () => {
    for (const body of [{ po_number: '  ' }, { due_date: 'x' }, { tax_code: 2 }, { tax: -1 }, { tax_percent: 'a' }, { po_date: 5 }]) {
        assert.throws(() => validatePoFields(body, { partial: true }), (e) => e instanceof PoError && e.status === 400);
    }
});
