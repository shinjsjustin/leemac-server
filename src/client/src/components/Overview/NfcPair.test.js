import React, { act } from 'react';
import { render } from '../../testUtils/render';
import NfcPair from './NfcPair';
import { apiFetch } from '../../api/apiFetch';

jest.mock('../../api/apiFetch', () => ({ apiFetch: jest.fn() }));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let reader;
const setup = async (props) => {
  const onChanged = jest.fn();
  apiFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
  let view;
  await act(async () => { view = render(<NfcPair jobPartId={5} paired={false} onChanged={onChanged} {...props} />); });
  const c = view.container;
  return {
    c, onChanged,
    click: (el) => act(async () => { el.click(); }),
    btn: (text) => [...c.querySelectorAll('button')].find((b) => b.textContent.trim() === text),
  };
};

beforeEach(() => {
  reader = null;
  window.NDEFReader = function NDEFReader() { reader = this; this.scan = jest.fn().mockResolvedValue(); };
});
afterEach(() => { delete window.NDEFReader; apiFetch.mockReset(); document.body.innerHTML = ''; });

test('shows not supported without NDEFReader', async () => {
  delete window.NDEFReader;
  const { c } = await setup();
  expect(c.textContent).toContain('NFC not supported here');
  expect(c.querySelector('button')).toBeNull();
});

test('pairs a scanned tag, then onChanged', async () => {
  const { c, click, btn, onChanged } = await setup();
  await click(btn('Pair NFC'));
  expect(c.textContent).toContain('Scanning');
  expect(btn('Cancel')).toBeDefined();
  await act(async () => { await reader.onreading({ serialNumber: 'AB:CD' }); });
  expect(apiFetch).toHaveBeenCalledWith('/internal/job/pairnfctag', { method: 'PUT', body: { jobPartId: 5, nfcTagId: 'AB:CD' } });
  expect(onChanged).toHaveBeenCalledTimes(1);
});

test('Cancel stops scanning and returns to Pair NFC', async () => {
  const { click, btn } = await setup();
  await click(btn('Pair NFC'));
  await click(btn('Cancel'));
  expect(btn('Pair NFC')).toBeDefined();
  expect(apiFetch).not.toHaveBeenCalled();
});

test('shows pairing error from the server', async () => {
  const { c, click, btn, onChanged } = await setup();
  apiFetch.mockResolvedValue({ ok: false, json: async () => ({ error: 'Tag in use' }) });
  await click(btn('Pair NFC'));
  await act(async () => { await reader.onreading({ serialNumber: 'X' }); });
  expect(c.textContent).toContain('Tag in use');
  expect(onChanged).not.toHaveBeenCalled();
});

test('paired shows Paired and Unpair calls unpairnfctag', async () => {
  const { c, click, btn, onChanged } = await setup({ paired: true });
  expect(c.textContent).toContain('Paired');
  await click(btn('Unpair'));
  expect(apiFetch).toHaveBeenCalledWith('/internal/job/unpairnfctag', { method: 'PUT', body: { jobPartId: 5 } });
  expect(onChanged).toHaveBeenCalledTimes(1);
});
