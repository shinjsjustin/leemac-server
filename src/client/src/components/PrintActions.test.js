import { act } from 'react';
import { render } from '../testUtils/render';
import PrintActions from './PrintActions';
import { printFile, downloadFile } from '../api/printApi';

jest.mock('../api/printApi', () => ({ printFile: jest.fn(), downloadFile: jest.fn() }));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const button = (container, label) => [...container.querySelectorAll('button')].find((b) => b.textContent === label);
const setup = () => render(<PrintActions fileId={60} filename="a.pdf" kind="drawing" />).container;

test('renders Download PDF and Print buttons', () => {
  const c = setup();
  expect(button(c, 'Download PDF')).toBeTruthy();
  expect(button(c, 'Print')).toBeTruthy();
});

test('Download PDF saves the file under its filename', async () => {
  downloadFile.mockResolvedValue({ ok: true, data: {} });
  const c = setup();
  await act(async () => button(c, 'Download PDF').click());
  expect(downloadFile).toHaveBeenCalledWith(60, 'a.pdf');
});

test('Print disables while pending, calls once, then reports the printer and copies', async () => {
  let finish;
  printFile.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  const c = setup();
  await act(async () => button(c, 'Print').click());
  expect(button(c, 'Print').disabled).toBe(true);
  await act(async () => button(c, 'Print').click());
  expect(printFile).toHaveBeenCalledTimes(1);
  expect(printFile).toHaveBeenCalledWith(60, 'drawing');
  await act(async () => finish({ ok: true, data: { printer: 'Brother', copies: 2 } }));
  expect(button(c, 'Print').disabled).toBe(false);
  expect(c.querySelector('span[role="status"]').textContent).toBe('Sent to Brother (2 copies)');
});

test('Print shows the server error in the status line', async () => {
  printFile.mockResolvedValue({ ok: false, error: { message: 'no enabled letter printer' } });
  const c = setup();
  await act(async () => button(c, 'Print').click());
  expect(c.querySelector('span[role="status"]').textContent).toBe('no enabled letter printer');
});
