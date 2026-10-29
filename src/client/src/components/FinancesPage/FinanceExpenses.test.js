import React, { act, useState } from 'react';
import { render } from '../../testUtils/render';
import FinanceExpenses from './FinanceExpenses';
import { apiFetch } from '../../api/apiFetch';

jest.mock('../../api/apiFetch', () => ({ apiFetch: jest.fn() }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const PERIOD = { id: 4, lable: 'Q4 2026' };
const reply = (body) => ({ status: 200, ok: true, json: async () => body });
const EXPENSES = [
  { id: 1, description: 'Drill bits', vendor: 'Home Depot', amount: '120.50', expense_date: '2026-10-12T00:00:00.000Z',
    jobs: [{ job_id: 9, job_number: 512, company_name: 'Acme' }] },
  { id: 2, description: 'Coolant', vendor: null, amount: '80.00', expense_date: '2026-10-03T00:00:00.000Z', jobs: [] },
];
// Lets a test change props on the mounted component, since render() has no rerender.
let setHarnessProps;
function Harness({ initial }) {
  const [props, set] = useState(initial);
  setHarnessProps = set;
  return <FinanceExpenses {...props} />;
}
const mount = async (expenses = EXPENSES, props = {}) => {
  apiFetch.mockImplementation(async () => reply({ expenses }));
  const onCreate = jest.fn();
  let view;
  const initial = { period: PERIOD, onCreate, refreshKey: 0, canEdit: true, ...props };
  await act(async () => { view = render(<Harness initial={initial} />); });
  return { c: view.container, onCreate, initial };
};

beforeEach(() => apiFetch.mockReset());

test('fetches the period expenses and exposes the expenses anchor', async () => {
  const { c } = await mount();
  expect(apiFetch).toHaveBeenCalledWith('/internal/finances/periods/4/expenses?limit=100&offset=0');
  expect(c.querySelector('#expenses')).not.toBeNull();
});

test('lists date, vendor and description, linked job and amount', async () => {
  const { c } = await mount();
  const rows = [...c.querySelectorAll('tbody tr')].map((r) => r.textContent);
  expect(rows).toHaveLength(2);
  expect(rows[0]).toContain('10/12/2026');
  expect(rows[0]).toContain('Home Depot · Drill bits');
  expect(rows[0]).toContain('512');
  expect(rows[0]).toContain('$120.50');
  expect(rows[1]).toContain('Coolant');
  expect(rows[1]).not.toContain('·');
  expect(c.querySelector('a[href="/job/9"]')).not.toBeNull();
});

test('footer shows the total of all expenses', async () => {
  const { c } = await mount();
  expect(c.querySelector('tfoot').textContent).toContain('$200.50');
});

test('+ Create expense calls onCreate', async () => {
  const { c, onCreate } = await mount();
  const btn = [...c.querySelectorAll('button')].find((b) => b.textContent === '+ Create expense');
  await act(async () => { btn.click(); });
  expect(onCreate).toHaveBeenCalledTimes(1);
});

test('shows an empty message and a zero total with no expenses', async () => {
  const { c } = await mount([]);
  expect(c.textContent).toContain('No expenses for this period.');
  expect(c.textContent).toContain('$0.00');
});

test('refetches when refreshKey changes', async () => {
  const { initial } = await mount();
  expect(apiFetch).toHaveBeenCalledTimes(1);
  await act(async () => { setHarnessProps({ ...initial, refreshKey: 1 }); });
  expect(apiFetch).toHaveBeenCalledTimes(2);
});

test('refetches the new period when period changes', async () => {
  const { initial } = await mount();
  await act(async () => { setHarnessProps({ ...initial, period: { id: 5 } }); });
  expect(apiFetch).toHaveBeenCalledWith('/internal/finances/periods/5/expenses?limit=100&offset=0');
});

test('without canEdit there is no + Create expense button but rows still show', async () => {
  const { c } = await mount(EXPENSES, { canEdit: false });
  expect([...c.querySelectorAll('button')].find((b) => b.textContent === '+ Create expense')).toBeUndefined();
  expect(c.querySelectorAll('tbody tr')).toHaveLength(2);
});
