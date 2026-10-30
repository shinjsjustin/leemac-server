import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { render } from '../../testUtils/render';
import JobFiles from './JobFiles';
import { apiFetch } from '../../api/apiFetch';
import { printFile } from '../../api/printApi';
import { openJobPdf } from './jobFileQueue';

jest.mock('../../api/apiFetch', () => ({ apiFetch: jest.fn() }));
jest.mock('../../api/printApi', () => ({ printFile: jest.fn(), downloadFile: jest.fn() }));
jest.mock('./jobFileQueue', () => ({ enqueueJobFile: jest.fn(), openJobPdf: jest.fn() }));
jest.mock('../ClientComponents/DrawingTile', () => ({ __esModule: true, default: ({ file, enqueue, onOpen }) => (
  <button type="button" data-testid="tile" data-file-id={file.id} data-enqueue={enqueue === require('./jobFileQueue').enqueueJobFile ? 'queue' : 'other'} onClick={() => onOpen(file)}>tile</button>
) }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const FILES = [
  { id: 1, filename: 'PO 4500.pdf', mimetype: 'application/pdf', size: 2, uploaded_at: '2026-10-14T12:00:00.000Z' },
  { id: 2, filename: 'part.step', mimetype: 'application/octet-stream', size: 3, uploaded_at: '2026-10-13T12:00:00.000Z' },
];
const reply = (status, body = {}) => ({ status, ok: status < 400, json: async () => body, blob: async () => new Blob(['x']) });

const mount = async (refreshKey = 0) => {
  let view;
  await act(async () => { view = render(<JobFiles jobId={55} refreshKey={refreshKey} />); });
  return view;
};
const button = (c, text) => [...c.querySelectorAll('button')].find((b) => b.textContent.startsWith(text));
const click = (el) => act(async () => { el.click(); });

beforeEach(() => {
  window.alert = jest.fn();
  window.open = jest.fn(() => ({ focus: jest.fn() }));
  window.URL.createObjectURL = jest.fn(() => 'blob:x');
  window.URL.revokeObjectURL = jest.fn();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  apiFetch.mockImplementation(async (url) => (url.startsWith('/internal/job/files') ? reply(200, FILES) : reply(200)));
});
afterEach(() => { jest.resetAllMocks(); jest.restoreAllMocks(); document.body.innerHTML = ''; });

test('pdf file is a card with a thumbnail tile, name and date; other file has type icon', async () => {
  const { container: c } = await mount();
  expect(apiFetch).toHaveBeenCalledWith('/internal/job/files?jobId=55');
  const cards = c.querySelectorAll('.jc-grid .jc-card');
  expect(cards).toHaveLength(2);
  expect(cards[0].querySelector('[data-testid="tile"]').dataset.enqueue).toBe('queue');
  expect(cards[0].querySelector('.jc-type')).toBeNull();
  expect(cards[0].textContent).toContain('PO 4500.pdf');
  expect(cards[0].textContent).toContain('2026-10-14');
  expect(cards[1].querySelector('[data-testid="tile"]')).toBeNull();
  expect(cards[1].querySelector('.jc-type').textContent).toBe('STEP');
  expect(cards[1].textContent).toContain('part.step');
  expect(cards[1].textContent).toContain('2026-10-13');
});

test('clicking a pdf thumbnail opens that file', async () => {
  const { container: c } = await mount();
  await click(c.querySelector('[data-testid="tile"]'));
  expect(openJobPdf).toHaveBeenCalledWith(FILES[0]);
});

test('a non-pdf Download saves the file without opening a tab', async () => {
  const { container: c } = await mount();
  const cards = c.querySelectorAll('.jc-card');
  await click(button(cards[1], 'Download'));
  expect(apiFetch).toHaveBeenCalledWith('/internal/part/blob/download?fileID=2');
  expect(window.URL.createObjectURL).toHaveBeenCalled();
  expect(window.open).not.toHaveBeenCalled();
});

test('choosing files uploads them as files and refetches', async () => {
  const { container: c } = await mount();
  const input = c.querySelector('input[type="file"]');
  const file = new File(['abc'], 'a.txt');
  await act(async () => {
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  const call = apiFetch.mock.calls.find((x) => x[0] === '/internal/job/uploadfile?id=55');
  expect(call[1].method).toBe('POST');
  expect(call[1].body.getAll('files')).toEqual([file]);
  expect(apiFetch.mock.calls.filter((x) => x[0].startsWith('/internal/job/files'))).toHaveLength(2);
});

test('failed upload alerts the user', async () => {
  apiFetch.mockImplementation(async (url) => (url.startsWith('/internal/job/files') ? reply(200, FILES) : reply(500)));
  const { container: c } = await mount();
  const input = c.querySelector('input[type="file"]');
  await act(async () => {
    Object.defineProperty(input, 'files', { value: [new File(['a'], 'a.txt')], configurable: true });
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect(window.alert).toHaveBeenCalledWith('Failed to upload files.');
});

test('refetches when refreshKey changes', async () => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(<JobFiles jobId={55} refreshKey={0} />); });
  await act(async () => { root.render(<JobFiles jobId={55} refreshKey={1} />); });
  expect(apiFetch.mock.calls.filter((x) => x[0] === '/internal/job/files?jobId=55')).toHaveLength(2);
  act(() => root.unmount());
});

test('pdf cards have Print and Download PDF; other cards only Download', async () => {
  const { container: c } = await mount();
  const cards = c.querySelectorAll('.jc-card');
  expect(button(cards[0], 'Print')).toBeTruthy();
  expect(button(cards[0], 'Download PDF')).toBeTruthy();
  expect(button(cards[1], 'Print')).toBeUndefined();
  expect(button(cards[1], 'Download PDF')).toBeUndefined();
  expect(button(cards[1], 'Download')).toBeTruthy();
});

test('Print on a pdf card prints that file with kind file', async () => {
  printFile.mockResolvedValue({ ok: true, data: { printer: 'Shop', copies: 1 } });
  const { container: c } = await mount();
  await click(button(c.querySelectorAll('.jc-card')[0], 'Print'));
  expect(printFile).toHaveBeenCalledWith(1, 'file');
});
