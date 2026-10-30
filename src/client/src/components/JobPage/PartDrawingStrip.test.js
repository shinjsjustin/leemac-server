import React, { act } from 'react';
import { render } from '../../testUtils/render';
import PartDrawingStrip from './PartDrawingStrip';
import { apiFetch } from '../../api/apiFetch';
import { printFile } from '../../api/printApi';

jest.mock('../../api/apiFetch', () => ({ apiFetch: jest.fn() }));
jest.mock('../../api/printApi', () => ({ printFile: jest.fn(), downloadFile: jest.fn() }));
jest.mock('../PdfImage', () => ({ PdfThumbnail: ({ previewUrl, onClick }) => <i className="thumb" onClick={onClick}>{previewUrl}</i> }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const FILES = [
  { id: 7, filename: 'a.pdf', mimetype: 'application/pdf', content: 'eA==' },
  { id: 8, filename: 'b.pdf', mimetype: 'application/pdf', content: 'eA==' },
  { id: 9, filename: 'c.png', mimetype: 'image/png', content: 'eA==' },
];
const mount = async () => {
  let view;
  await act(async () => { view = render(<PartDrawingStrip partId={3} />); });
  return view;
};
const button = (c, text) => [...c.querySelectorAll('button')].find((b) => b.textContent === text);

beforeEach(() => {
  window.URL.createObjectURL = jest.fn(() => 'blob:x');
  window.URL.revokeObjectURL = jest.fn();
  window.open = jest.fn();
  apiFetch.mockResolvedValue({ ok: true, json: async () => FILES });
});
afterEach(() => { jest.resetAllMocks(); document.body.innerHTML = ''; });

test('renders one thumbnail per PDF and only the Drawings button until opened', async () => {
  const { container: c } = await mount();
  expect(c.querySelector('.jp-strip')).not.toBeNull();
  expect(c.querySelectorAll('.thumb')).toHaveLength(2);
  expect(c.querySelectorAll('button')).toHaveLength(1);
  expect(button(c, 'Drawings ▾').getAttribute('aria-expanded')).toBe('false');
});

test('clicking a thumbnail opens the PDF', async () => {
  const { container: c } = await mount();
  await act(async () => { c.querySelector('.thumb').click(); });
  expect(window.open).toHaveBeenCalledWith('blob:x', '_blank');
});

test('menu lists filenames with Download and Print, printing as kind drawing', async () => {
  printFile.mockResolvedValue({ ok: true, data: { printer: 'Shop', copies: 1 } });
  const { container: c } = await mount();
  await act(async () => { button(c, 'Drawings ▾').click(); });
  expect(button(c, 'Drawings ▾').getAttribute('aria-expanded')).toBe('true');
  expect(c.textContent).toContain('a.pdf');
  expect(c.textContent).toContain('b.pdf');
  expect(c.querySelectorAll('button')).toHaveLength(5);
  await act(async () => { c.querySelectorAll('button')[4].click(); });
  expect(printFile).toHaveBeenCalledWith(8, 'drawing');
});

test('Escape closes the menu', async () => {
  const { container: c } = await mount();
  await act(async () => { button(c, 'Drawings ▾').click(); });
  await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
  expect(c.querySelectorAll('button')).toHaveLength(1);
});

test('renders nothing without PDF drawings', async () => {
  apiFetch.mockResolvedValue({ ok: true, json: async () => [FILES[2]] });
  const { container: c } = await mount();
  expect(c.innerHTML).toBe('');
});
