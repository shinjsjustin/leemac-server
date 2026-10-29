import React, { act } from 'react';
import { render } from '../../testUtils/render';
import JobExpenses from './JobExpenses';
import { apiFetch } from '../../api/apiFetch';

jest.mock('../../api/apiFetch', () => ({ apiFetch: jest.fn() }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const EXPENSES = [
  { id: 1, description: 'Stock', vendor: 'Metals Co', amount: '40.50', expense_date: '2026-10-02T00:00:00.000Z', category: 'Material', notes: '' },
  { id: 2, description: 'Anodize', vendor: 'Finish Inc', amount: '10.00', expense_date: '2026-10-03T00:00:00.000Z', category: 'Outside', notes: '' },
];
const reply = (status, body = {}) => ({ status, ok: status < 400, json: async () => body });
const mount = async (props = {}) => {
  let view;
  await act(async () => { view = render(<JobExpenses jobId={55} job={{ total_cost: 109.13 }} accessLevel={3} onTotal={jest.fn()} {...props} />); });
  return view.container;
};
const button = (c, text) => [...c.querySelectorAll('button')].find((b) => b.textContent.startsWith(text));
const click = (el) => act(async () => { el.click(); });
const type = (input, value) => act(async () => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
});

beforeEach(() => {
  window.alert = jest.fn();
  window.confirm = jest.fn(() => true);
  jest.spyOn(console, 'error').mockImplementation(() => {});
  apiFetch.mockImplementation(async (url) => (url.startsWith('/internal/expenses/byjob') ? reply(200, EXPENSES) : reply(200)));
});
afterEach(() => { jest.resetAllMocks(); jest.restoreAllMocks(); document.body.innerHTML = ''; });

test('renders nothing and never calls the API below level 3', async () => {
  const c = await mount({ accessLevel: 2 });
  expect(c.innerHTML).toBe('');
  expect(apiFetch).not.toHaveBeenCalled();
});

test('lists expenses with total and job total minus expenses, and reports the total', async () => {
  const onTotal = jest.fn();
  const c = await mount({ onTotal });
  expect(apiFetch).toHaveBeenCalledWith('/internal/expenses/byjob/55');
  const rows = c.querySelectorAll('tbody tr');
  expect(rows).toHaveLength(2);
  ['2026-10-02', 'Metals Co', 'Material', '40.50'].forEach((t) => {
    const cells = [...rows[0].querySelectorAll('td')].map((td) => td.textContent + [...td.querySelectorAll('input')].map((i) => i.value).join(''));
    expect(cells.join('|')).toContain(t);
  });
  const foot = c.querySelector('tfoot').textContent;
  expect(foot).toContain('$50.50');
  expect(foot).toContain('$58.63');
  expect(onTotal).toHaveBeenCalledWith(50.5);
});

test('creates an expense for the job and reloads', async () => {
  const c = await mount();
  await click(button(c, '+ Create expense'));
  await type(c.querySelector('input[name="description"]'), 'Bolts');
  await type(c.querySelector('input[name="amount"]'), '3.25');
  await type(c.querySelector('input[name="expense_date"]'), '2026-10-05');
  apiFetch.mockClear();
  await act(async () => { c.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
  expect(apiFetch).toHaveBeenCalledWith('/internal/expenses/create', {
    method: 'POST',
    body: { description: 'Bolts', vendor: '', amount: '3.25', expense_date: '2026-10-05', category: '', notes: '', jobIds: [55] },
  });
  expect(apiFetch).toHaveBeenCalledWith('/internal/expenses/byjob/55');
});

test('updates an edited expense', async () => {
  const c = await mount();
  const amount = c.querySelectorAll('tbody tr')[0].querySelector('input[name="amount"]');
  await type(amount, '41');
  await click(button(c.querySelectorAll('tbody tr')[0], 'Save'));
  expect(apiFetch).toHaveBeenCalledWith('/internal/expenses/update/1', {
    method: 'PUT',
    body: { description: 'Stock', vendor: 'Metals Co', amount: '41', expense_date: '2026-10-02T00:00:00.000Z', category: 'Material', notes: '' },
  });
});

test('deletes an expense only after confirming', async () => {
  const c = await mount();
  window.confirm.mockReturnValueOnce(false);
  await click(button(c.querySelectorAll('tbody tr')[1], 'Delete'));
  expect(apiFetch).not.toHaveBeenCalledWith('/internal/expenses/delete/2', expect.anything());
  await click(button(c.querySelectorAll('tbody tr')[1], 'Delete'));
  expect(apiFetch).toHaveBeenCalledWith('/internal/expenses/delete/2', { method: 'DELETE' });
});
