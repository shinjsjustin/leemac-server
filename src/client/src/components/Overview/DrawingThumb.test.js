import React, { act } from 'react';
import { render } from '../../testUtils/render';
import { DrawingThumb } from './PartRow';
import { apiFetch } from '../../api/apiFetch';
import { printFile } from '../../api/printApi';

jest.mock('../../api/apiFetch', () => ({ apiFetch: jest.fn() }));
jest.mock('../../api/printApi', () => ({ printFile: jest.fn(), downloadFile: jest.fn() }));
jest.mock('../PdfImage', () => ({ PdfThumbnail: ({ previewUrl }) => <i className="thumb">{previewUrl}</i> }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const FILES = [
  { id: 7, filename: 'a.pdf', mimetype: 'application/pdf', content: 'eA==' },
  { id: 8, filename: 'b.pdf', mimetype: 'application/pdf', content: 'eA==' },
];
const mount = async (props) => {
  let view;
  await act(async () => { view = render(<DrawingThumb partId={3} {...props} />); });
  return view;
};
const button = (c, text) => [...c.querySelectorAll('button')].find((b) => b.textContent === text);

beforeEach(() => {
  window.URL.createObjectURL = jest.fn(() => 'blob:x');
  window.URL.revokeObjectURL = jest.fn();
  apiFetch.mockResolvedValue({ ok: true, json: async () => FILES });
});
afterEach(() => { jest.resetAllMocks(); document.body.innerHTML = ''; });

test('renders no print buttons by default', async () => {
  const { container: c } = await mount();
  expect(c.querySelectorAll('.thumb')).toHaveLength(2);
  expect(c.querySelectorAll('button')).toHaveLength(0);
});

test('withActions shows Print and Download PDF under each drawing, printing as kind drawing', async () => {
  printFile.mockResolvedValue({ ok: true, data: { printer: 'Shop', copies: 1 } });
  const { container: c } = await mount({ withActions: true });
  expect(c.querySelectorAll('button')).toHaveLength(4);
  expect(c.querySelectorAll('button')[0].textContent).toBe('Download PDF');
  await act(async () => { c.querySelectorAll('button')[3].click(); });
  expect(printFile).toHaveBeenCalledWith(8, 'drawing');
});
