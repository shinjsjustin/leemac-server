import React, { act, useState } from 'react';
import { render } from '../../testUtils/render';
import FinanceInvoices from './FinanceInvoices';
import { apiFetch } from '../../api/apiFetch';

jest.mock('../../api/apiFetch', () => ({ apiFetch: jest.fn() }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const PERIOD = { id: 4, lable: 'Q4 2026' };
const NOW = Date.UTC(2026, 9, 29, 12);
const inv = (id, job, company, date, status, extra = {}) => ({
  id, job_number: job, company_id: 1, company_name: company, invoice_number: 1000 + id,
  invoice_date: date, invoice_status: status, attention: null, po_number: null, total_cost: '100.00', ...extra,
});
const INVOICES = [
  inv(1, 501, 'Zeta Co', '2026-10-19T00:00:00.000Z', 'waiting', { attention: 'Pat', po_number: 'PO-7', total_cost: '1234.50' }),
  inv(2, 502, 'Acme', '2026-10-24T00:00:00.000Z', 'waiting'),
  inv(3, 503, 'Zeta Co', '2026-09-29T00:00:00.000Z', 'waiting'),
  inv(4, 504, 'Acme', '2026-10-01T00:00:00.000Z', 'paid'),
];
const reply = (body, ok = true) => ({ status: ok ? 200 : 400, ok, json: async () => body });
const page = (invoices, hasMore) => reply({ invoices, pagination: { hasMore } });

// Lets a test change props on the mounted component, since render() has no rerender.
let setHarnessProps;
function Harness({ initial }) {
  const [props, set] = useState(initial);
  setHarnessProps = set;
  return <FinanceInvoices {...props} />;
}
const mount = async (props = {}) => {
  const onChanged = jest.fn();
  let view;
  const initial = { period: PERIOD, onChanged, refreshKey: 0, canEdit: true, ...props };
  await act(async () => { view = render(<Harness initial={initial} />); });
  return { c: view.container, onChanged, initial };
};
const invoiceFetches = () => apiFetch.mock.calls.filter(([u]) => u.includes('/invoices?'));
const button = (c, text) => [...c.querySelectorAll('button')].find((b) => b.textContent.startsWith(text));
const click = async (el) => { await act(async () => { el.click(); }); };

beforeEach(() => {
  apiFetch.mockReset();
  apiFetch.mockImplementation(async (url) => (url.includes('/invoices?') ? page(INVOICES, false) : reply({})));
  jest.spyOn(Date, 'now').mockReturnValue(NOW);
  jest.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => jest.restoreAllMocks());

test('has an invoices anchor and tabs with counts', async () => {
  const { c } = await mount();
  expect(c.querySelector('#invoices')).not.toBeNull();
  expect(button(c, 'Waiting').textContent).toContain('3');
  expect(button(c, 'Paid').textContent).toContain('1');
});

test('pages through every invoice of the period', async () => {
  apiFetch.mockImplementation(async (url) => {
    if (url.endsWith('offset=0')) return page(INVOICES.slice(0, 2), true);
    if (url.endsWith('offset=100')) return page(INVOICES.slice(2), false);
    return reply({});
  });
  const { c } = await mount();
  expect(apiFetch).toHaveBeenCalledWith('/internal/finances/periods/4/invoices?limit=100&offset=0');
  expect(apiFetch).toHaveBeenCalledWith('/internal/finances/periods/4/invoices?limit=100&offset=100');
  expect(button(c, 'Waiting').textContent).toContain('3');
});

test('groups waiting invoices by company, oldest first, with age, link and totals', async () => {
  const { c } = await mount();
  const headings = [...c.querySelectorAll('.fi-company')].map((h) => h.textContent);
  expect(headings).toEqual(['Zeta Co', 'Acme']);
  const rows = [...c.querySelectorAll('tbody tr')].map((r) => r.textContent);
  expect(rows).toHaveLength(3);
  expect(rows[0]).toContain('503');
  expect(rows[0]).toContain('30 days');
  expect(rows[1]).toContain('501');
  expect(rows[1]).toContain('Pat');
  expect(rows[1]).toContain('PO-7');
  expect(rows[1]).toContain('$1,234.50');
  expect(rows[1]).toContain('10 days');
  expect(rows[2]).toContain('502');
  expect(c.querySelector('a[href="/job/1"]').textContent).toBe('501');
});

test('Paid tab shows paid invoices only', async () => {
  const { c } = await mount();
  await click(button(c, 'Paid'));
  const rows = [...c.querySelectorAll('tbody tr')];
  expect(rows).toHaveLength(1);
  expect(rows[0].textContent).toContain('504');
  expect(button(c, 'Mark waiting')).toBeTruthy();
  expect(button(c, 'Mark paid')).toBeUndefined();
});

test('Mark paid posts the job id, reloads and calls onChanged', async () => {
  const { c, onChanged } = await mount();
  await click(button(c, 'Mark paid'));
  expect(apiFetch).toHaveBeenCalledWith('/internal/invoices/markpaid', { method: 'POST', body: { jobId: 3 } });
  expect(onChanged).toHaveBeenCalledTimes(1);
  expect(apiFetch.mock.calls.filter(([u]) => u.includes('/invoices?'))).toHaveLength(2);
});

test('Mark waiting posts the job id and calls onChanged', async () => {
  const { c, onChanged } = await mount();
  await click(button(c, 'Paid'));
  await click(button(c, 'Mark waiting'));
  expect(apiFetch).toHaveBeenCalledWith('/internal/invoices/markwaiting', { method: 'POST', body: { jobId: 4 } });
  expect(onChanged).toHaveBeenCalledTimes(1);
});

test('Remove deletes the job from the period and calls onChanged', async () => {
  const { c, onChanged } = await mount();
  await click(button(c, 'Remove'));
  expect(apiFetch).toHaveBeenCalledWith('/internal/finances/periods/4/jobs/3', { method: 'DELETE' });
  expect(onChanged).toHaveBeenCalledTimes(1);
});

test('a declined confirmation sends nothing', async () => {
  window.confirm.mockReturnValue(false);
  const { c, onChanged } = await mount();
  await click(button(c, 'Remove'));
  await click(button(c, 'Mark paid'));
  expect(apiFetch.mock.calls.filter(([u]) => !u.includes('/invoices?'))).toHaveLength(0);
  expect(onChanged).not.toHaveBeenCalled();
});

test('a failed action does not call onChanged', async () => {
  jest.spyOn(window, 'alert').mockImplementation(() => {});
  apiFetch.mockImplementation(async (url) => (url.includes('/invoices?') ? page(INVOICES, false) : reply({ error: 'nope' }, false)));
  const { c, onChanged } = await mount();
  await click(button(c, 'Mark paid'));
  expect(onChanged).not.toHaveBeenCalled();
  expect(window.alert).toHaveBeenCalledWith('Failed: nope');
});

test('refetches when refreshKey changes', async () => {
  const { initial } = await mount();
  expect(invoiceFetches()).toHaveLength(1);
  await act(async () => { setHarnessProps({ ...initial, refreshKey: 1 }); });
  expect(invoiceFetches()).toHaveLength(2);
});

test('refetches the new period when period changes', async () => {
  const { initial } = await mount();
  await act(async () => { setHarnessProps({ ...initial, period: { id: 5 } }); });
  expect(apiFetch).toHaveBeenCalledWith('/internal/finances/periods/5/invoices?limit=100&offset=0');
});

test('without canEdit no action buttons render on either tab', async () => {
  const { c } = await mount({ canEdit: false });
  const actions = () => ['Mark paid', 'Mark waiting', 'Remove'].map((t) => button(c, t));
  expect(c.querySelectorAll('tbody tr')).toHaveLength(3);
  expect(actions()).toEqual([undefined, undefined, undefined]);
  await click(button(c, 'Paid'));
  expect(c.querySelectorAll('tbody tr')).toHaveLength(1);
  expect(actions()).toEqual([undefined, undefined, undefined]);
});
