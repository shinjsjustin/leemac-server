export const BILLING_LABELS = { no_po: 'No PO', po: 'PO · no invoice', invoiced: 'Invoiced' };

const isFilled = (value) => typeof value === 'string' && value.trim() !== '';

export function billingState(job) {
  if (isFilled(job.invoice_number)) return 'invoiced';
  if (isFilled(job.po_number)) return 'po';
  return 'no_po';
}
