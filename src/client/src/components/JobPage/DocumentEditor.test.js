import { act } from 'react';
import { render } from '../../testUtils/render';
import DocumentEditor from './DocumentEditor';
import { getDocumentForm, refillDocument, saveDocument } from '../../api/jobDocumentsApi';

jest.mock('../../api/jobDocumentsApi', () => ({
  getDocumentForm: jest.fn(), refillDocument: jest.fn(), saveDocument: jest.fn(),
}));
jest.mock('../../api/printApi', () => ({ printFile: jest.fn(), downloadFile: jest.fn() }));
jest.mock('../../api/apiFetch', () => ({ apiFetch: jest.fn() }));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const FORM = {
  type: 'invoice',
  saved: true,
  savedAt: '2026-03-05T12:00:00.000Z',
  savedBy: 'Pat',
  fileId: 9,
  fields: {
    customer: { name: 'Acme', line1: '1 Main', line2: 'Suite 2', attention: 'Bob' },
    reference: '1042AC',
    dates: { created: '01-02-2026', po: '01-03-2026', due: '01-04-2026', invoice: '01-05-2026', ship: '01-06-2026' },
    poNumber: 'PO-7',
    invoiceNumber: 'INV-5',
    tax: { flag: 'Y', percent: 8, amount: 0 },
  },
  parts: [
    { number: 'A-1', rev: 'B', description: 'Bracket', details: '*Al', quantity: 4, price: 2.5 },
    { number: 'A-2', rev: '—', description: 'Plate', details: '', quantity: 1, price: 10 },
  ],
};
const REFILLED = {
  ...FORM,
  fields: { ...FORM.fields, customer: { ...FORM.fields.customer, name: 'Fresh Co' } },
  parts: [{ number: 'Z-9', rev: '—', description: 'New', details: '', quantity: 2, price: 3 }],
};

const byLabel = (c, text) =>
  [...c.querySelectorAll('label')].find((l) => l.textContent.startsWith(text))?.querySelector('input');
const button = (c, text) => [...c.querySelectorAll('button')].find((b) => b.textContent === text);
const click = (el) => act(async () => { el.click(); });
const type = (input, value) => act(async () => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
});
const partInput = (c, row, name) => c.querySelector(`input[aria-label="Part ${row} ${name}"]`);

async function setup(props = {}) {
  const handlers = { onSaved: jest.fn(), onClose: jest.fn() };
  let view;
  await act(async () => {
    view = render(<DocumentEditor jobId={7} type="invoice" label="Invoice" {...handlers} {...props} />);
  });
  return { c: view.container, ...handlers };
}

beforeEach(() => {
  jest.clearAllMocks();
  getDocumentForm.mockResolvedValue({ ok: true, data: FORM });
});

test('loads the form for the job and type and fills every field and part', async () => {
  const { c } = await setup();
  expect(getDocumentForm).toHaveBeenCalledWith(7, 'invoice');
  expect(byLabel(c, 'Customer name').value).toBe('Acme');
  expect(byLabel(c, 'Line 1').value).toBe('1 Main');
  expect(byLabel(c, 'Line 2').value).toBe('Suite 2');
  expect(byLabel(c, 'Attention').value).toBe('Bob');
  expect(byLabel(c, 'Reference').value).toBe('1042AC');
  expect(byLabel(c, 'Created date').value).toBe('01-02-2026');
  expect(byLabel(c, 'PO date').value).toBe('01-03-2026');
  expect(byLabel(c, 'Due date').value).toBe('01-04-2026');
  expect(byLabel(c, 'Invoice date').value).toBe('01-05-2026');
  expect(byLabel(c, 'Ship date').value).toBe('01-06-2026');
  expect(byLabel(c, 'PO number').value).toBe('PO-7');
  expect(byLabel(c, 'Invoice number').value).toBe('INV-5');
  expect(byLabel(c, 'Tax').checked).toBe(true);
  expect(byLabel(c, 'Tax percent').value).toBe('8');
  expect(byLabel(c, 'Tax amount').value).toBe('0');
  expect(partInput(c, 1, 'description').value).toBe('Bracket');
  expect(partInput(c, 1, 'quantity').value).toBe('4');
  expect(partInput(c, 2, 'price').value).toBe('10');
  expect(c.textContent).toContain('Saved');
  expect(c.textContent).toContain('2026');
});

test('shows Not saved yet for an unsaved document', async () => {
  getDocumentForm.mockResolvedValue({ ok: true, data: { ...FORM, saved: false, savedAt: null } });
  const { c } = await setup();
  expect(c.textContent).toContain('Not saved yet');
  expect(c.textContent).not.toContain('Saved 2026');
});

test('invoice number input appears for invoices only', async () => {
  getDocumentForm.mockResolvedValue({ ok: true, data: { ...FORM, type: 'quote' } });
  const { c } = await setup({ type: 'quote' });
  expect(byLabel(c, 'Invoice number')).toBeUndefined();
  expect(byLabel(c, 'PO number')).toBeDefined();
});

test.each(['quote', 'order'])('leadtime input shows the loaded value for %s', async (docType) => {
  const data = { ...FORM, type: docType, fields: { ...FORM.fields, leadtime: '3 weeks' } };
  getDocumentForm.mockResolvedValue({ ok: true, data });
  const { c } = await setup({ type: docType });
  expect(byLabel(c, 'Leadtime').value).toBe('3 weeks');
});

test.each(['invoice', 'packing', 'shipping'])('leadtime input is absent for %s', async (docType) => {
  const data = { ...FORM, type: docType, fields: { ...FORM.fields, leadtime: '3 weeks' } };
  getDocumentForm.mockResolvedValue({ ok: true, data });
  const { c } = await setup({ type: docType });
  expect(byLabel(c, 'Leadtime')).toBeUndefined();
});

test('Save on a quote sends the edited leadtime inside fields', async () => {
  saveDocument.mockResolvedValue({ ok: true, data: {} });
  const data = { ...FORM, type: 'quote', fields: { ...FORM.fields, leadtime: '3 weeks' } };
  getDocumentForm.mockResolvedValue({ ok: true, data });
  const { c } = await setup({ type: 'quote' });
  await type(byLabel(c, 'Leadtime'), '5 weeks');
  await click(button(c, 'Save'));
  expect(saveDocument).toHaveBeenCalledWith(7, 'quote', {
    fields: { ...data.fields, leadtime: '5 weeks' },
    parts: data.parts,
  });
});

test('Save sends the edited fields and parts, then calls onSaved without printing', async () => {
  saveDocument.mockResolvedValue({ ok: true, data: {} });
  const { c, onSaved } = await setup();
  await type(byLabel(c, 'Customer name'), 'Acme 2');
  await type(byLabel(c, 'Due date'), '02-02-2026');
  await type(byLabel(c, 'Invoice number'), 'INV-9');
  await click(byLabel(c, 'Tax'));
  await type(byLabel(c, 'Tax percent'), '9');
  await type(partInput(c, 2, 'details'), '*Steel');
  await click(button(c, 'Save'));
  const expected = JSON.parse(JSON.stringify(FORM));
  expected.fields.customer.name = 'Acme 2';
  expected.fields.dates.due = '02-02-2026';
  expected.fields.invoiceNumber = 'INV-9';
  expected.fields.tax = { flag: 'N', percent: '9', amount: 0 };
  expected.parts[1].details = '*Steel';
  expect(saveDocument).toHaveBeenCalledWith(7, 'invoice', { fields: expected.fields, parts: expected.parts });
  expect(onSaved).toHaveBeenCalledTimes(1);
  expect(require('../../api/printApi').printFile).not.toHaveBeenCalled();
});

test('Add part appends an empty row and Remove drops that row', async () => {
  saveDocument.mockResolvedValue({ ok: true, data: {} });
  const { c } = await setup();
  await click(button(c, 'Add part'));
  expect(partInput(c, 3, 'number').value).toBe('');
  await type(partInput(c, 3, 'number'), 'C-3');
  await click(c.querySelector('button[aria-label="Remove part 1"]'));
  expect(partInput(c, 1, 'number').value).toBe('A-2');
  expect(partInput(c, 2, 'number').value).toBe('C-3');
  expect(partInput(c, 3, 'number')).toBeNull();
  await click(button(c, 'Save'));
  const sent = saveDocument.mock.calls[0][2].parts;
  expect(sent.map((p) => p.number)).toEqual(['A-2', 'C-3']);
});

test('Refill from job replaces the form and does not save', async () => {
  refillDocument.mockResolvedValue({ ok: true, data: REFILLED });
  const { c, onSaved } = await setup();
  await click(button(c, 'Refill from job'));
  expect(refillDocument).toHaveBeenCalledWith(7, 'invoice');
  expect(byLabel(c, 'Customer name').value).toBe('Fresh Co');
  expect(partInput(c, 1, 'number').value).toBe('Z-9');
  expect(partInput(c, 2, 'number')).toBeNull();
  expect(saveDocument).not.toHaveBeenCalled();
  expect(onSaved).not.toHaveBeenCalled();
});

test('a failed save shows the server message in an alert line and does not call onSaved', async () => {
  saveDocument.mockResolvedValue({ ok: false, error: { message: 'Invoice number INV-5 is already used' } });
  const { c, onSaved } = await setup();
  await click(button(c, 'Save'));
  expect(c.querySelector('[role="alert"]').textContent).toBe('Invoice number INV-5 is already used');
  expect(onSaved).not.toHaveBeenCalled();
});

test('a failed load shows the message in an alert line', async () => {
  getDocumentForm.mockResolvedValue({ ok: false, error: { message: 'Job not found' } });
  const { c } = await setup();
  expect(c.querySelector('[role="alert"]').textContent).toBe('Job not found');
});

test('Cancel calls onClose', async () => {
  const { c, onClose } = await setup();
  await click(button(c, 'Cancel'));
  expect(onClose).toHaveBeenCalledTimes(1);
});
