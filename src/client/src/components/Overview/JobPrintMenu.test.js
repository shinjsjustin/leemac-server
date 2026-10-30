import { act } from 'react';
import { render } from '../../testUtils/render';
import JobPrintMenu from './JobPrintMenu';
import { jobPrintables, printFile, printJobDrawings } from '../../api/printApi';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('../../api/printApi', () => ({
  jobPrintables: jest.fn(), printFile: jest.fn(), printJobDrawings: jest.fn(),
}));

const doc = (type, label, extra = {}) => ({
  type, label, file_id: 5, filename: `${type}.pdf`, reason: null, ...extra,
});
const printables = (drawings = 6) => ({
  ok: true,
  data: {
    documents: [
      doc('quote', 'Quote'),
      doc('order', 'Order', { file_id: null, reason: 'Not made yet' }),
      doc('invoice', 'Invoice', { file_id: null, reason: 'Click Update invoice first' }),
      doc('packing', 'Packing list', { file_id: null, reason: 'Click Update invoice first' }),
      doc('shipping', 'Shipping label', { file_id: null, reason: 'Click Update invoice first' }),
    ],
    drawings,
  },
});

let view;
beforeEach(() => {
  jest.resetAllMocks();
  jobPrintables.mockResolvedValue(printables());
});
afterEach(() => view?.unmount());

const mount = (ui = <JobPrintMenu jobId={3} />) => { view = render(ui); return view.container; };
const text = (t) => [...document.body.querySelectorAll('*')].find((e) => !e.children.length && e.textContent === t);
const toggle = () => document.querySelector('button[aria-label="Job options"]');
const items = () => [...document.querySelectorAll('[role="menuitem"]')];
const item = (re) => items().find((e) => re.test(e.textContent));
const click = (el) => act(async () => el.click());
const key = (el, k) => act(async () => {
  el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
});
const open = async () => { await click(toggle()); };

test('fetches nothing until opened, then once for repeated opens', async () => {
  mount();
  expect(jobPrintables).not.toHaveBeenCalled();
  expect(text('Quote')).toBeUndefined();
  await open();
  await click(toggle());
  await open();
  expect(text('Quote')).toBeTruthy();
  expect(jobPrintables).toHaveBeenCalledTimes(1);
  expect(jobPrintables).toHaveBeenCalledWith(3);
});

test('shows Loading while fetching and lists five documents plus drawings', async () => {
  let finish;
  jobPrintables.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  mount();
  await open();
  expect(text('Loading…')).toBeTruthy();
  await act(async () => finish(printables()));
  expect(text('Loading…')).toBeUndefined();
  expect(items()).toHaveLength(6);
  expect(item(/Print all part drawings/)).toBeTruthy();
});

test('a document with a reason is disabled and shows the reason', async () => {
  mount();
  await open();
  expect(item(/Order/).disabled).toBe(true);
  expect(item(/Quote/).disabled).toBe(false);
  expect(text('Not made yet')).toBeTruthy();
});

test('an enabled document prints by file id and type and shows the printer', async () => {
  printFile.mockResolvedValue({ ok: true, data: { printer: 'Brother', copies: 1 } });
  mount();
  await open();
  await click(item(/Quote/));
  expect(text('Sent to Brother')).toBeTruthy();
  expect(printFile).toHaveBeenCalledWith(5, 'quote');
});

test('a failed document print shows the error', async () => {
  printFile.mockResolvedValue({ ok: false, error: { message: 'no printer' } });
  mount();
  await open();
  await click(item(/Quote/));
  expect(text('no printer')).toBeTruthy();
});

test.each([
  [6, 'Queued 6 drawings'],
  [1, 'Queued 1 drawing'],
  [0, 'No drawings to print'],
])('print all drawings with %i queued shows %s', async (queued, message) => {
  printJobDrawings.mockResolvedValue({ ok: true, data: { queued, printer: 'B' } });
  mount();
  await open();
  await click(item(/Print all part drawings/));
  expect(text(message)).toBeTruthy();
  expect(printJobDrawings).toHaveBeenCalledWith(3);
});

test('print all drawings shows the API error', async () => {
  printJobDrawings.mockResolvedValue({ ok: false, error: { message: 'no letter printer' } });
  mount();
  await open();
  await click(item(/Print all part drawings/));
  expect(text('no letter printer')).toBeTruthy();
});

test('print all drawings is disabled when the job has none', async () => {
  jobPrintables.mockResolvedValue(printables(0));
  mount();
  await open();
  expect(item(/Print all part drawings/).disabled).toBe(true);
});

test('shows the error when printables fail to load', async () => {
  jobPrintables.mockResolvedValue({ ok: false, error: { message: 'job not found' } });
  mount();
  await open();
  expect(text('job not found')).toBeTruthy();
});

test('closes on Escape and on a second click of the button', async () => {
  mount();
  await open();
  await key(text('Quote'), 'Escape');
  expect(text('Quote')).toBeUndefined();
  await open();
  expect(text('Quote')).toBeTruthy();
  await click(toggle());
  expect(text('Quote')).toBeUndefined();
});

test('clicks and keydowns inside do not reach parents', async () => {
  const parentClick = jest.fn();
  const parentKey = jest.fn();
  printFile.mockResolvedValue({ ok: true, data: { printer: 'B' } });
  mount(<div onClick={parentClick} onKeyDown={parentKey}><JobPrintMenu jobId={3} /></div>);
  await open();
  await click(text('Quote'));
  await key(text('Quote'), 'Enter');
  expect(parentClick).not.toHaveBeenCalled();
  expect(parentKey).not.toHaveBeenCalled();
});
