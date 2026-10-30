import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { render } from '../../testUtils/render';
import JobFiles from './JobFiles';
import { apiFetch } from '../../api/apiFetch';
import { printFile } from '../../api/printApi';

jest.mock('../../api/apiFetch', () => ({ apiFetch: jest.fn() }));
jest.mock('../../api/printApi', () => ({ printFile: jest.fn(), downloadFile: jest.fn() }));
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

test('lists files with type tag, name and date', async () => {
  const { container: c } = await mount();
  expect(apiFetch).toHaveBeenCalledWith('/internal/job/files?jobId=55');
  const rows = c.querySelectorAll('.jf-item');
  expect(rows).toHaveLength(2);
  expect(rows[0].querySelector('.jf-type').textContent).toBe('PDF');
  expect(rows[0].textContent).toContain('PO 4500.pdf');
  expect(rows[0].textContent).toContain('2026-10-14');
  expect(rows[1].querySelector('.jf-type').textContent).toBe('STEP');
});

test('a pdf previews in a new tab and other files download', async () => {
  const { container: c } = await mount();
  const rows = c.querySelectorAll('.jf-item');
  await click(button(rows[0], 'Preview'));
  expect(apiFetch).toHaveBeenCalledWith('/internal/part/blob/download?fileID=1');
  expect(window.open).toHaveBeenCalledWith('blob:x', '_blank');
  window.open.mockClear();
  await click(button(rows[1], 'Download'));
  expect(apiFetch).toHaveBeenCalledWith('/internal/part/blob/download?fileID=2');
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

test('pdf rows keep Preview and add Print and Download PDF; other rows only Download', async () => {
  const { container: c } = await mount();
  const rows = c.querySelectorAll('.jf-item');
  expect(button(rows[0], 'Preview')).toBeTruthy();
  expect(button(rows[0], 'Print')).toBeTruthy();
  expect(button(rows[0], 'Download PDF')).toBeTruthy();
  expect(button(rows[1], 'Print')).toBeUndefined();
  expect(button(rows[1], 'Download PDF')).toBeUndefined();
  expect(button(rows[1], 'Download')).toBeTruthy();
});

test('Print on a pdf row prints that file with kind file', async () => {
  printFile.mockResolvedValue({ ok: true, data: { printer: 'Shop', copies: 1 } });
  const { container: c } = await mount();
  await click(button(c.querySelectorAll('.jf-item')[0], 'Print'));
  expect(printFile).toHaveBeenCalledWith(1, 'file');
});
