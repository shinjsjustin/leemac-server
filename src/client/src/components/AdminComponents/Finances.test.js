import React, { act } from 'react';
import { render } from '../../testUtils/render';
import Finances from './Finances';
import { apiFetch } from '../../api/apiFetch';
import { jwtDecode } from 'jwt-decode';

jest.mock('../../api/apiFetch', () => ({ apiFetch: jest.fn() }));
jest.mock('jwt-decode', () => ({ jwtDecode: jest.fn() }));
// Section stubs expose the props Finances passes down and a trigger for each callback.
jest.mock('../FinancesPage/FinanceHeadline', () => (p) => (
  <div data-testid="headline" data-period={p.period.id} data-key={p.refreshKey}>
    <button onClick={() => p.onSelect(p.periods[1])}>pick-older</button>
  </div>
));
jest.mock('../FinancesPage/FinanceInvoices', () => (p) => (
  <section id="invoices" data-testid="invoices" data-key={p.refreshKey} data-edit={String(p.canEdit)}>
    <button onClick={p.onChanged}>changed</button>
  </section>
));
jest.mock('../FinancesPage/FinanceExpenses', () => (p) => (
  <section id="expenses" data-testid="expenses" data-key={p.refreshKey} data-edit={String(p.canEdit)}>
    <button onClick={p.onCreate}>open-expense</button>
  </section>
));
jest.mock('../FinancesPage/FinanceModals', () => ({
  CreatePeriodModal: (p) => <button onClick={() => p.onCreated({ id: 9 })}>period-modal</button>,
  CreateExpenseModal: (p) => <button onClick={p.onCreated}>expense-modal</button>,
  AddInvoiceRangeModal: (p) => <button onClick={p.onAdded}>range-modal</button>,
}));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const PERIODS = [{ id: 4, lable: 'Q4 2026', year: 2026, quarter: 4 }, { id: 3, lable: 'Q3 2026', year: 2026, quarter: 3 }];
const reply = (body, ok = true) => ({ ok, status: ok ? 200 : 400, json: async () => body });
let current;
let periods;
const route = (url) => {
  if (url === '/internal/finances/overview') return reply({ periods });
  if (url === '/internal/finances/currentfinancialperiod') return reply({ current_financial_period_id: current });
  if (url === '/internal/finances/updatefinancialperiod') return reply({});
  if (url.endsWith('/jobs')) return reply({ cleared_count: 2 });
  return reply({});
};
const mount = async (access, path = '/finances') => {
  jwtDecode.mockReturnValue({ access, email: 'a@b.c' });
  localStorage.setItem('token', 'x');
  let view;
  await act(async () => { view = render(<Finances />, { path }); });
  return view.container;
};
const button = (c, text) => [...c.querySelectorAll('button')].find((b) => b.textContent.includes(text));
const click = async (el) => { await act(async () => { el.click(); }); };
const q = (c, id) => c.querySelector(`[data-testid="${id}"]`);

beforeEach(() => {
  current = 3;
  periods = PERIODS;
  apiFetch.mockReset();
  apiFetch.mockImplementation(async (url) => route(url));
  window.confirm = jest.fn(() => true);
  window.alert = jest.fn();
  Element.prototype.scrollIntoView = jest.fn();
});

describe('Finances', () => {
  it('starts on the current period', async () => {
    const c = await mount(2);
    expect(q(c, 'headline').dataset.period).toBe('3');
  });

  it('falls back to the newest period when none is current', async () => {
    current = null;
    const c = await mount(2);
    expect(q(c, 'headline').dataset.period).toBe('4');
  });

  it('hides header actions and disables editing below level 2', async () => {
    const c = await mount(1);
    expect(button(c, 'Set current period')).toBeUndefined();
    expect(button(c, 'Clear all invoices')).toBeUndefined();
    expect(button(c, '+ Add invoices')).toBeUndefined();
    expect(q(c, 'invoices').dataset.edit).toBe('false');
    expect(q(c, 'expenses').dataset.edit).toBe('false');
  });

  it('shows header actions and enables editing at level 2', async () => {
    const c = await mount(2);
    ['Set current period', 'Clear all invoices', '+ Add invoices', '+ Create expense', '+ Create period']
      .forEach((t) => expect(button(c, t)).toBeDefined());
    expect(q(c, 'invoices').dataset.edit).toBe('true');
  });

  it('sets the current period after confirming', async () => {
    current = 4;
    const c = await mount(2);
    await click(button(c, 'pick-older'));
    await click(button(c, 'Set current period'));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('Q3 2026'));
    expect(apiFetch).toHaveBeenCalledWith('/internal/finances/updatefinancialperiod', { method: 'POST', body: { periodId: 3 } });
  });

  it('does nothing when the set-current confirm is declined', async () => {
    window.confirm = jest.fn(() => false);
    const c = await mount(2);
    await click(button(c, 'Set current period'));
    expect(apiFetch.mock.calls.some(([u]) => u === '/internal/finances/updatefinancialperiod')).toBe(false);
  });

  it('clears all invoices after confirming and bumps refreshKey', async () => {
    const c = await mount(2);
    await click(button(c, 'Clear all invoices'));
    expect(apiFetch).toHaveBeenCalledWith('/internal/finances/periods/3/jobs', { method: 'DELETE' });
    expect(q(c, 'headline').dataset.key).toBe('1');
  });

  it('does not clear when the confirm is declined', async () => {
    window.confirm = jest.fn(() => false);
    const c = await mount(2);
    await click(button(c, 'Clear all invoices'));
    expect(apiFetch.mock.calls.some(([u]) => u.endsWith('/jobs'))).toBe(false);
  });

  it('bumps refreshKey for all three sections after a list change and modal results', async () => {
    const c = await mount(2);
    await click(button(c, 'changed'));
    expect(['headline', 'invoices', 'expenses'].map((id) => q(c, id).dataset.key)).toEqual(['1', '1', '1']);
    await click(button(c, 'open-expense'));
    await click(button(c, 'expense-modal'));
    expect(q(c, 'expenses').dataset.key).toBe('2');
    expect(button(c, 'expense-modal')).toBeUndefined();
    await click(button(c, '+ Add invoices'));
    await click(button(c, 'range-modal'));
    expect(q(c, 'invoices').dataset.key).toBe('3');
  });

  it('shows the empty state with Create at level 2 only', async () => {
    periods = [];
    const c2 = await mount(2);
    expect(c2.textContent).toContain('No financial periods');
    expect(button(c2, '+ Create period')).toBeDefined();
    const c1 = await mount(1);
    expect(c1.textContent).toContain('No financial periods');
    expect(button(c1, '+ Create period')).toBeUndefined();
  });

  it('scrolls the hash section into view after load', async () => {
    const c = await mount(2, '/finances#expenses');
    const calls = Element.prototype.scrollIntoView.mock.instances;
    expect(calls).toEqual([q(c, 'expenses')]);
  });

  it('does not scroll without a hash', async () => {
    await mount(2);
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  });
});
