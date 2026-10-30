import { billingState, BILLING_LABELS } from './billingState';

test.each([
  [{ invoice_number: 'INV-1', po_number: 'PO1' }, 'invoiced'],
  [{ invoice_number: 'INV-1', po_number: null }, 'invoiced'],
  [{ invoice_number: null, po_number: 'PO1' }, 'po'],
  [{ invoice_number: '  ', po_number: 'PO1' }, 'po'],
  [{ po_number: 'PO1' }, 'po'],
  [{ invoice_number: '', po_number: '' }, 'no_po'],
  [{ invoice_number: ' ', po_number: '  ' }, 'no_po'],
  [{ invoice_number: null, po_number: null }, 'no_po'],
  [{}, 'no_po'],
])('billingState(%j) is %s', (job, expected) => {
  expect(billingState(job)).toBe(expected);
});

test('labels each state for display', () => {
  expect(BILLING_LABELS).toEqual({ no_po: 'No PO', po: 'PO · no invoice', invoiced: 'Invoiced' });
});
