import React, { act } from 'react';
import { render } from '../../testUtils/render';
import { CreatePeriodModal, CreateExpenseModal, AddInvoiceRangeModal } from './FinanceModals';
import { apiFetch } from '../../api/apiFetch';

jest.mock('../../api/apiFetch', () => ({ apiFetch: jest.fn() }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const PERIOD = { id: 4, lable: 'Q4 2026' };
const reply = (body, ok = true) => ({ status: ok ? 200 : 400, ok, json: async () => body });
const button = (c, text) => [...c.querySelectorAll('button')].find((b) => b.textContent.startsWith(text));

const setValue = (input, value) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
};

const mount = async (element) => {
  let view;
  await act(async () => { view = render(element); });
  return view.container;
};

beforeEach(() => apiFetch.mockReset());

describe.each([
  ['CreatePeriodModal', (onClose) => <CreatePeriodModal token="t" onClose={onClose} onCreated={jest.fn()} />],
  ['CreateExpenseModal', (onClose) => <CreateExpenseModal token="t" period={PERIOD} onClose={onClose} onCreated={jest.fn()} />],
  ['AddInvoiceRangeModal', (onClose) => <AddInvoiceRangeModal token="t" period={PERIOD} onClose={onClose} onAdded={jest.fn()} />],
])('%s', (_name, make) => {
  it('renders and calls onClose when Cancel is clicked', async () => {
    const onClose = jest.fn();
    const c = await mount(make(onClose));
    expect(button(c, 'Cancel')).toBeTruthy();
    await act(async () => { button(c, 'Cancel').click(); });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('AddInvoiceRangeModal submit', () => {
  it('posts the range to the period jobs/range endpoint and calls onAdded on Done', async () => {
    apiFetch.mockResolvedValue(reply({ results: { assigned: [1, 2], skipped: [], failed: [] } }));
    const onAdded = jest.fn();
    const onClose = jest.fn();
    const c = await mount(<AddInvoiceRangeModal token="t" period={PERIOD} onClose={onClose} onAdded={onAdded} />);

    await act(async () => {
      setValue(c.querySelector('input[name="invoice_from"]'), '100');
      setValue(c.querySelector('input[name="invoice_to"]'), '150');
    });
    await act(async () => { button(c, 'Add Invoices').click(); });

    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(apiFetch).toHaveBeenCalledWith('/internal/finances/periods/4/jobs/range', {
      method: 'POST',
      body: { invoice_from: 100, invoice_to: 150 },
    });
    expect(c.textContent).toContain('2 invoices added');

    await act(async () => { button(c, 'Done').click(); });
    expect(onAdded).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
