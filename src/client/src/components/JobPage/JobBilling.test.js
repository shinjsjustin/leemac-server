import React, { act } from 'react';
import { render } from '../../testUtils/render';
import JobBilling from './JobBilling';
import { apiFetch } from '../../api/apiFetch';

jest.mock('../../api/apiFetch', () => ({ apiFetch: jest.fn() }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const JOB = { po_number: 'PO-7', po_date: '2026-10-01T00:00:00.000Z', due_date: '2026-11-01T00:00:00.000Z', tax_code: 'TX', tax: 9.13, tax_percent: 9.13 };
const mount = async (props = {}) => {
  let view;
  await act(async () => { view = render(<JobBilling jobId={55} job={JOB} accessLevel={3} onJobChanged={jest.fn()} {...props} />); });
  return view.container;
};
const field = (c, name) => c.querySelector(`input[name="${name}"]`);
const button = (c, text) => [...c.querySelectorAll('button')].find((b) => b.textContent.startsWith(text));
const click = (el) => act(async () => { el.click(); });
const type = (input, value) => act(async () => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
});
const reply = (status, body = {}) => ({ status, ok: status < 400, json: async () => body });

beforeEach(() => {
  window.alert = jest.fn();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { jest.resetAllMocks(); jest.restoreAllMocks(); document.body.innerHTML = ''; });

test('prefills the form from the job', async () => {
  const c = await mount();
  expect(field(c, 'poNum').value).toBe('PO-7');
  expect(field(c, 'poDate').value).toBe('2026-10-01');
  expect(field(c, 'dueDate').value).toBe('2026-11-01');
  expect(field(c, 'taxCode').value).toBe('TX');
  expect(field(c, 'tax').value).toBe('9.13');
  expect(field(c, 'taxPercent').value).toBe('9.13');
});

test('saves edited PO fields to updatepo and tells the page the job changed', async () => {
  apiFetch.mockResolvedValue(reply(200));
  const onJobChanged = jest.fn();
  const c = await mount({ onJobChanged });
  await type(field(c, 'poNum'), 'PO-8');
  await click(button(c, 'Save'));
  expect(apiFetch).toHaveBeenCalledWith('/internal/job/updatepo', {
    method: 'POST',
    body: { jobId: 55, poNum: 'PO-8', poDate: '2026-10-01', dueDate: '2026-11-01', taxCode: 'TX', tax: '9.13', taxPercent: '9.13' },
  });
  expect(onJobChanged).toHaveBeenCalledTimes(1);
});

test('does not call onJobChanged when the PO save fails', async () => {
  apiFetch.mockResolvedValue(reply(500, { error: 'x' }));
  const onJobChanged = jest.fn();
  const c = await mount({ onJobChanged });
  await click(button(c, 'Save'));
  expect(onJobChanged).not.toHaveBeenCalled();
  expect(window.alert).toHaveBeenCalledWith('Failed to update PO.');
});

test('Update invoice appears only at level 3 and posts to updateinvoiceandincrement', async () => {
  apiFetch.mockResolvedValue(reply(200));
  const onJobChanged = jest.fn();
  const low = await mount({ accessLevel: 2 });
  expect(button(low, 'Update invoice')).toBeUndefined();
  document.body.innerHTML = '';
  const c = await mount({ onJobChanged });
  await click(button(c, 'Update invoice'));
  expect(apiFetch).toHaveBeenCalledWith('/internal/job/updateinvoiceandincrement', { method: 'POST', body: { jobId: 55 } });
  expect(onJobChanged).toHaveBeenCalledTimes(1);
});
