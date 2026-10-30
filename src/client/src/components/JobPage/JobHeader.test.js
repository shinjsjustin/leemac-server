import React, { act } from 'react';
import { render } from '../../testUtils/render';
import JobHeader from './JobHeader';
import { apiFetch } from '../../api/apiFetch';
import { runJobExport } from '../../api/jobExport';

jest.mock('../../api/apiFetch', () => ({ apiFetch: jest.fn() }));
jest.mock('../../api/jobExport', () => ({ runJobExport: jest.fn() }));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const JOB = {
  job_number: '13804', company_name: 'Halvorsen Storage', company_id: 7, attention: 'Priya',
  created_at: '2026-10-14T09:30:00.000Z', po_number: '4500-88221', po_date: '2026-10-14',
  due_date: '2026-11-03', invoice_number: '10850', invoice_date: '2026-10-20',
  tax_code: 'CA-SC', tax: '1157.42', tax_percent: 9.125, subtotal: 12684, total_cost: 13841.42,
};
const PARTS = [{ job_part_id: 1, number: 'A-1' }];

const mount = async (over = {}) => {
  const props = {
    job: JOB, jobId: 55, parts: PARTS, expensesTotal: 1146.2, accessLevel: 3, isStarred: false,
    onStar: jest.fn(), onUnstar: jest.fn(), onEdited: jest.fn(), onFilesChanged: jest.fn(), ...over,
  };
  let view;
  await act(async () => { view = render(<JobHeader {...props} />); });
  return { c: view.container, props };
};
const button = (c, text) => [...c.querySelectorAll('button')].find((b) => b.textContent.startsWith(text));
const click = (el) => act(async () => { el.click(); });
const fact = (c, label) => [...c.querySelectorAll('.jh-kv')].find((k) => k.querySelector('small').textContent === label);

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(new Date('2026-10-29T12:00:00'));
  window.alert = jest.fn();
  apiFetch.mockResolvedValue({ status: 200, json: async () => [{ id: 7, name: 'Halvorsen', code: 'HS' }] });
});
afterEach(() => { jest.useRealTimers(); jest.resetAllMocks(); document.body.innerHTML = ''; });

test('shows number, company, attention and every fact', async () => {
  const { c } = await mount();
  expect(c.querySelector('.jh-jn').textContent).toBe('13804');
  expect(c.textContent).toContain('Halvorsen Storage');
  expect(c.textContent).toContain('Priya');
  const text = (l) => fact(c, l).querySelector('b').textContent;
  expect(text('PO')).toBe('4500-88221');
  expect(text('PO date')).toBe('14 Oct');
  expect(text('Due')).toBe('3 Nov · 5 days');
  expect(text('Invoice')).toBe('10850');
  expect(text('Invoice date')).toBe('20 Oct');
  expect(text('Tax code')).toBe('CA-SC');
  expect(text('Tax')).toBe('9.125%');
  expect(text('Subtotal')).toBe('$12,684.00');
  expect(text('Expenses')).toBe('$1,146.20');
  expect(text('Total')).toBe('$13,841.42');
  expect(fact(c, 'Created')).toBeTruthy();
});

test('hides the Expenses fact below level 3', async () => {
  const { c } = await mount({ accessLevel: 2 });
  expect(fact(c, 'Expenses')).toBeUndefined();
});

test('shows a dash when a fact has no value', async () => {
  const { c } = await mount({ job: { ...JOB, po_number: null, due_date: null } });
  expect(fact(c, 'PO').querySelector('b').textContent).toBe('—');
  expect(fact(c, 'Due').querySelector('b').textContent).toBe('—');
});

test('shows starred state and Star or Unstar calls the matching handler', async () => {
  const off = await mount();
  expect(off.c.textContent).not.toContain('Starred');
  await click(button(off.c, 'Star'));
  expect(off.props.onStar).toHaveBeenCalledTimes(1);
  document.body.innerHTML = '';
  const on = await mount({ isStarred: true });
  expect(on.c.textContent).toContain('Starred');
  await click(button(on.c, 'Unstar'));
  expect(on.props.onUnstar).toHaveBeenCalledTimes(1);
  expect(on.props.onStar).not.toHaveBeenCalled();
});

test('Export and Populate Google Sheet are level 3 only', async () => {
  const { c } = await mount({ accessLevel: 2 });
  expect(button(c, 'Export')).toBeUndefined();
  expect(button(c, 'Populate Google Sheet')).toBeUndefined();
  expect(button(c, 'Edit job info')).toBeTruthy();
});

test('exports the chosen types, alerts the message and refreshes files', async () => {
  runJobExport.mockResolvedValue({ ok: true, refresh: true, message: 'Quote saved' });
  const { c, props } = await mount();
  await click(button(c, 'Export'));
  await click(button(c, 'Invoice + Packing + Shipping'));
  expect(runJobExport).toHaveBeenCalledWith(55, ['invoice', 'packing', 'shipping']);
  expect(window.alert).toHaveBeenCalledWith('Quote saved');
  expect(props.onFilesChanged).toHaveBeenCalledTimes(1);
  expect(c.textContent).not.toContain('Exporting');
});

test('single-type exports pass a one-item list and skip refresh when not asked', async () => {
  runJobExport.mockResolvedValue({ ok: false, refresh: false, message: 'nope' });
  const { c, props } = await mount();
  await click(button(c, 'Export'));
  await click(button(c, 'Quote'));
  expect(runJobExport).toHaveBeenCalledWith(55, ['quote']);
  expect(props.onFilesChanged).not.toHaveBeenCalled();
});

test('Order export passes a one-item order list', async () => {
  runJobExport.mockResolvedValue({ ok: true, refresh: false, message: 'm' });
  const { c } = await mount();
  await click(button(c, 'Export'));
  await click(button(c, 'Order'));
  expect(runJobExport).toHaveBeenCalledWith(55, ['order']);
});

test('shows Exporting… while busy', async () => {
  let release;
  runJobExport.mockReturnValue(new Promise((r) => { release = r; }));
  const { c } = await mount();
  await click(button(c, 'Export'));
  await click(button(c, 'Order'));
  expect(button(c, 'Exporting…').disabled).toBe(true);
  await act(async () => { release({ ok: true, refresh: false, message: 'm' }); });
  expect(button(c, 'Export')).toBeTruthy();
});

test('Populate Google Sheet clears, populates and confirms', async () => {
  const { c } = await mount();
  await click(button(c, 'Populate Google Sheet'));
  expect(apiFetch.mock.calls.slice(-2).map((x) => x[0])).toEqual(['/internal/sheet/clear', '/internal/sheet/populate']);
  expect(apiFetch).toHaveBeenLastCalledWith('/internal/sheet/populate', { method: 'POST', body: { job: JOB, parts: PARTS } });
  expect(window.alert).toHaveBeenCalledWith('Google Sheet populated successfully!');
});

test('Populate does not confirm when clearing fails', async () => {
  apiFetch.mockResolvedValue({ status: 500, json: async () => ({}) });
  const { c } = await mount();
  await click(button(c, 'Populate Google Sheet'));
  expect(window.alert).toHaveBeenCalledWith('Failed to clear Google Sheet.');
  expect(window.alert).not.toHaveBeenCalledWith('Google Sheet populated successfully!');
});

test('Edit job info opens the modal and saving posts updatedetails then calls onEdited', async () => {
  const { c, props } = await mount();
  await click(button(c, 'Edit job info'));
  expect(c.querySelector('select[name="companyId"]').value).toBe('7');
  const po = c.querySelector('input[name="poNum"]');
  expect(po.value).toBe('4500-88221');
  await click(button(c, 'Save Changes'));
  const call = apiFetch.mock.calls.find((x) => x[0] === '/internal/job/updatedetails');
  expect(call[1].method).toBe('POST');
  expect(call[1].body).toMatchObject({
    jobId: 55, attention: 'Priya', companyId: '7', poNum: '4500-88221', poDate: '2026-10-14',
    dueDate: '2026-11-03', invoiceNumber: '10850', taxCode: 'CA-SC', tax: '1157.42', taxPercent: '9.125',
  });
  expect(call[1].body.createdAt).toBe('2026-10-14 09:30:00');
  expect(props.onEdited).toHaveBeenCalledTimes(1);
  expect(c.querySelector('select[name="companyId"]')).toBeNull();
});

test('level 1 edits leave tax fields out of the update', async () => {
  const { c } = await mount({ accessLevel: 1 });
  await click(button(c, 'Edit job info'));
  expect(c.querySelector('input[name="taxCode"]')).toBeNull();
  await click(button(c, 'Save Changes'));
  const call = apiFetch.mock.calls.find((x) => x[0] === '/internal/job/updatedetails');
  expect(call[1].body).not.toHaveProperty('taxCode');
});

test('a failed save alerts and keeps onEdited uncalled', async () => {
  apiFetch.mockImplementation(async (url) => (url === '/internal/job/updatedetails'
    ? { status: 500, json: async () => ({}) }
    : { status: 200, json: async () => [] }));
  jest.spyOn(console, 'error').mockImplementation(() => {});
  const { c, props } = await mount();
  await click(button(c, 'Edit job info'));
  await click(button(c, 'Save Changes'));
  expect(window.alert).toHaveBeenCalledWith('Failed to update job details.');
  expect(props.onEdited).not.toHaveBeenCalled();
});

test.each([[0, false, false], [1, false, true], [2, true, true]])('level %i: money facts shown %s, Edit job info shown %s', async (level, money, edit) => {
  const { c } = await mount({ accessLevel: level });
  ['Tax code', 'Tax', 'Subtotal', 'Total'].forEach((l) => expect(!!fact(c, l)).toBe(money));
  expect(!!button(c, 'Edit job info')).toBe(edit);
});

test.each([
  ['invoice set', {}, 'bill-invoiced', 'Invoiced'],
  ['PO only', { invoice_number: '' }, 'bill-po', 'PO · no invoice'],
  ['neither', { invoice_number: null, po_number: null }, 'bill-no_po', 'No PO'],
])('%s: hero carries its billing class and chip label', async (_name, over, cls, label) => {
  const { c } = await mount({ job: { ...JOB, ...over } });
  const hero = c.querySelector('.jh-hero');
  expect(hero.classList.contains(cls)).toBe(true);
  expect(hero.className.match(/bill-/g)).toHaveLength(1);
  expect(c.querySelector('.jh-h1row .jh-bill').textContent).toBe(label);
});

describe('on a phone', () => {
  const original = window.matchMedia;
  const mockNarrow = () => {
    window.matchMedia = jest.fn((query) => ({ matches: query === '(max-width: 600px)', media: query, addEventListener: () => {}, removeEventListener: () => {} }));
  };
  const toggle = (c) => c.querySelector('.jh-right button[aria-label="Job actions"]');
  const items = (c) => [...c.querySelectorAll('.jh-menu button')].map((b) => b.textContent);
  const press = (key) => act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })); });
  beforeEach(mockNarrow);
  afterEach(() => { window.matchMedia = original; });

  test('.jh-right holds only the actions button until opened', async () => {
    const { c } = await mount();
    expect([...c.querySelectorAll('.jh-right button')]).toEqual([toggle(c)]);
    expect(toggle(c).getAttribute('aria-expanded')).toBe('false');
    expect(button(c, 'Edit job info')).toBeUndefined();
    expect(c.querySelector('.jh-menu')).toBeNull();
  });

  test('the menu lists every action at level 3', async () => {
    const { c } = await mount();
    await click(toggle(c));
    expect(toggle(c).getAttribute('aria-expanded')).toBe('true');
    expect(items(c)).toEqual(['Edit job info', 'Quote', 'Order', 'Invoice + Packing + Shipping', 'Populate Google Sheet', 'Star']);
  });

  test('the menu leaves out export and populate below level 3 and shows Unstar when starred', async () => {
    const { c } = await mount({ accessLevel: 1, isStarred: true });
    await click(toggle(c));
    expect(items(c)).toEqual(['Edit job info', 'Unstar']);
  });

  test('Edit job info opens the modal and closes the menu', async () => {
    const { c } = await mount();
    await click(toggle(c));
    await click(button(c, 'Edit job info'));
    expect(c.querySelector('select[name="companyId"]')).not.toBeNull();
    expect(c.querySelector('.jh-menu')).toBeNull();
  });

  test('an export choice runs the export and closes the menu', async () => {
    runJobExport.mockResolvedValue({ ok: true, refresh: false, message: 'm' });
    const { c } = await mount();
    await click(toggle(c));
    await click(button(c, 'Order'));
    expect(runJobExport).toHaveBeenCalledWith(55, ['order']);
    expect(c.querySelector('.jh-menu')).toBeNull();
  });

  test('Populate Google Sheet runs and closes the menu', async () => {
    const { c } = await mount();
    await click(toggle(c));
    await click(button(c, 'Populate Google Sheet'));
    expect(apiFetch).toHaveBeenLastCalledWith('/internal/sheet/populate', { method: 'POST', body: { job: JOB, parts: PARTS } });
    expect(c.querySelector('.jh-menu')).toBeNull();
  });

  test('Star and Unstar call their handlers and close the menu', async () => {
    const off = await mount();
    await click(toggle(off.c));
    await click(button(off.c, 'Star'));
    expect(off.props.onStar).toHaveBeenCalledTimes(1);
    expect(off.c.querySelector('.jh-menu')).toBeNull();
    document.body.innerHTML = '';
    const on = await mount({ isStarred: true });
    await click(toggle(on.c));
    await click(button(on.c, 'Unstar'));
    expect(on.props.onUnstar).toHaveBeenCalledTimes(1);
    expect(on.props.onStar).not.toHaveBeenCalled();
  });

  test('Escape closes the menu', async () => {
    const { c } = await mount();
    await click(toggle(c));
    await press('Escape');
    expect(c.querySelector('.jh-menu')).toBeNull();
  });

  test('a second click on the actions button closes the menu', async () => {
    const { c } = await mount();
    await click(toggle(c));
    await click(toggle(c));
    expect(c.querySelector('.jh-menu')).toBeNull();
  });
});
