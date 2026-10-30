import React, { act } from 'react';
import { render } from '../../testUtils/render';
import Printers from './Printers';
import { listPrinters, savePrinter, testPrint, issueAgentToken } from '../../api/printApi';
import { jwtDecode } from 'jwt-decode';

jest.mock('../../api/printApi');
jest.mock('jwt-decode', () => ({ jwtDecode: jest.fn() }));
jest.mock('../AdminLayout/AdminLayout', () => ({ current, children }) => (
  <div data-current={current}>{children}</div>
));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const COPIES = { quote: 1, order: 2, invoice: 3, packing: 4, shipping: 5, drawing: 6, file: 7 };
const PRINTER = { id: 4, name: 'Front Desk', cups_queue: 'HP_Q', role: 'letter', media: 'Letter', copies: COPIES, enabled: 1 };
const JOB = { id: 9, kind: 'quote', printer_name: 'Front Desk', copies: 2, status: 'failed', error: 'paper jam', created_at: '2026-10-01T10:00:00.000Z' };
const listing = (overrides = {}) => ({
  ok: true,
  data: { printers: [PRINTER], agent: { last_seen_at: null }, jobs: [JOB], ...overrides },
});

async function mount(access) {
  jwtDecode.mockReturnValue({ role: 'admin', access });
  localStorage.setItem('token', 'x');
  let view;
  await act(async () => {
    view = render(<Printers />, { path: '/printers' });
  });
  return view;
}

const click = async (el) => {
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};
const byText = (view, tag, text) =>
  [...view.container.querySelectorAll(tag)].find((e) => e.textContent.trim() === text);
const field = (view, label) => view.container.querySelector(`[aria-label="${label}"]`);
const setValue = async (el, value) => {
  const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
    el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  });
};

beforeEach(() => {
  jest.resetAllMocks();
  localStorage.clear();
  listPrinters.mockResolvedValue(listing());
});

test('renders in AdminLayout as printers and shows each printer read-only below level 3', async () => {
  const view = await mount(1);
  expect(view.container.firstChild.dataset.current).toBe('printers');
  const text = view.container.textContent;
  ['Front Desk', 'HP_Q', 'letter', 'Letter', 'Enabled'].forEach((s) => expect(text).toContain(s));
  Object.entries(COPIES).forEach(([kind, n]) => expect(text).toContain(`${kind}: ${n}`));
  expect(text).toContain('Agent last seen: never');
  expect(text).toContain('quote');
  expect(text).toContain('paper jam');
  expect(text).toContain('failed');
  expect(view.container.querySelector('input')).toBeNull();
  expect(byText(view, 'button', 'Save')).toBeUndefined();
  expect(byText(view, 'button', 'Generate agent token')).toBeUndefined();
  expect(byText(view, 'button', 'Test print')).toBeDefined();
});

test('shows the agent last seen time when present', async () => {
  listPrinters.mockResolvedValue(listing({ agent: { last_seen_at: '2026-10-02T08:30:00.000Z' } }));
  const view = await mount(1);
  expect(view.container.textContent).not.toContain('never');
  expect(view.container.textContent).toContain('Agent last seen:');
});

test('Test print calls testPrint with the printer id and shows the result', async () => {
  testPrint.mockResolvedValue({ ok: true, data: { job_id: 12, printer: 'Front Desk', copies: 1 } });
  const view = await mount(1);
  await click(byText(view, 'button', 'Test print'));
  expect(testPrint).toHaveBeenCalledWith(4);
  expect(view.container.textContent).toContain('Test page sent to Front Desk');
});

test('Test print shows the error when it fails', async () => {
  testPrint.mockResolvedValue({ ok: false, error: { message: 'no enabled letter printer' } });
  const view = await mount(1);
  await click(byText(view, 'button', 'Test print'));
  expect(view.container.textContent).toContain('no enabled letter printer');
});

test('level 3 edits a printer and Save sends its id and fields', async () => {
  savePrinter.mockResolvedValue({ ok: true, data: { ok: true } });
  const view = await mount(3);
  await setValue(field(view, 'Name 4'), 'Back Desk');
  await setValue(field(view, 'Copies shipping 4'), '2');
  await click(field(view, 'Enabled 4'));
  await click(byText(view, 'button', 'Save'));
  expect(savePrinter).toHaveBeenCalledWith({
    id: 4, name: 'Back Desk', cups_queue: 'HP_Q', role: 'letter', media: 'Letter',
    copies: { ...COPIES, shipping: 2 }, enabled: false,
  });
  expect(listPrinters).toHaveBeenCalledTimes(2);
});

test('Save shows the server error and does not reload', async () => {
  savePrinter.mockResolvedValue({ ok: false, error: { message: 'invalid cups_queue' } });
  const view = await mount(3);
  await click(byText(view, 'button', 'Save'));
  expect(view.container.textContent).toContain('invalid cups_queue');
  expect(listPrinters).toHaveBeenCalledTimes(1);
});

test('Add printer creates a printer without an id', async () => {
  savePrinter.mockResolvedValue({ ok: true, data: { id: 5 } });
  const view = await mount(3);
  await setValue(field(view, 'Name new'), 'Zebra');
  await setValue(field(view, 'CUPS queue new'), 'Zebra_Q');
  await setValue(field(view, 'Role new'), 'label');
  await setValue(field(view, 'Paper new'), '4x6');
  await click(byText(view, 'button', 'Add printer'));
  const arg = savePrinter.mock.calls[0][0];
  expect(arg).toMatchObject({ name: 'Zebra', cups_queue: 'Zebra_Q', role: 'label', media: '4x6', enabled: true });
  expect(arg).not.toHaveProperty('id');
  expect(Object.keys(arg.copies).sort()).toEqual(Object.keys(COPIES).sort());
});

test('Generate agent token shows the token once with a warning', async () => {
  issueAgentToken.mockResolvedValue({ ok: true, data: { token: 'tok-abc' } });
  const view = await mount(3);
  await click(byText(view, 'button', 'Generate agent token'));
  expect(view.container.textContent).toContain('tok-abc');
  expect(view.container.textContent).toContain('old token stops working');
  await click(byText(view, 'button', 'Dismiss'));
  expect(view.container.textContent).not.toContain('tok-abc');
});

test('shows the load error when listing fails', async () => {
  listPrinters.mockResolvedValue({ ok: false, error: { message: 'Something went wrong. Please try again.' } });
  const view = await mount(1);
  expect(view.container.textContent).toContain('Something went wrong');
});
