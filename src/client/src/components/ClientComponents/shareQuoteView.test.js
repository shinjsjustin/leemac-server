import { quoteView } from './shareQuoteView';

const reply = (over = {}) => ({
  company_name: 'Acme Corp',
  saved_at: '2026-01-02T00:00:00Z',
  fields: {
    reference: '1042AC',
    dates: { created: '03-04-2026' },
    leadtime: '2 weeks',
    tax: { flag: 'N', percent: 0, amount: 0 },
  },
  parts: [
    { number: 'P-1', rev: 'A', description: 'Bracket', details: '*Steel', quantity: '3', price: '12.50' },
    { number: 'P-2', rev: '—', description: '—', details: '', quantity: 2, price: 1000 },
  ],
  ...over,
});

describe('quoteView', () => {
  test('gives the header facts and line items with ext', () => {
    const view = quoteView(reply());
    expect(view.reference).toBe('1042AC');
    expect(view.date).toBe('03-04-2026');
    expect(view.leadTime).toBe('2 weeks');
    expect(view.company).toBe('Acme Corp');
    expect(view.items).toEqual([
      { number: 'P-1', rev: 'A', description: 'Bracket', details: '*Steel', quantity: 3, price: '$12.50', ext: '$37.50' },
      { number: 'P-2', rev: '—', description: '—', details: '', quantity: 2, price: '$1,000.00', ext: '$2,000.00' },
    ]);
  });

  test('without tax, total equals subtotal', () => {
    const view = quoteView(reply());
    expect(view.subtotal).toBe('$2,037.50');
    expect(view.tax).toBe('$0.00');
    expect(view.total).toBe('$2,037.50');
  });

  test('applies a tax percent to the subtotal', () => {
    const data = reply();
    data.fields.tax = { flag: 'Y', percent: 10, amount: 0 };
    const view = quoteView(data);
    expect(view.tax).toBe('$203.75');
    expect(view.total).toBe('$2,241.25');
  });

  test('a flat tax amount wins over the percent', () => {
    const data = reply();
    data.fields.tax = { flag: 'Y', percent: 10, amount: 5 };
    const view = quoteView(data);
    expect(view.tax).toBe('$5.00');
    expect(view.total).toBe('$2,042.50');
  });

  test('ignores tax figures when the flag is not Y', () => {
    const data = reply();
    data.fields.tax = { flag: 'N', percent: 10, amount: 5 };
    expect(quoteView(data).tax).toBe('$0.00');
  });
});
