import React, { act } from 'react';
import { render } from '../../testUtils/render';
import AddPart from './AddPart';
import { apiFetch } from '../../api/apiFetch';

jest.mock('../../api/apiFetch', () => ({ apiFetch: jest.fn() }));
jest.mock('jwt-decode', () => ({ jwtDecode: () => ({ access: 2 }) }));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const PART = {
  id: 1,
  number: 'A1',
  description: 'Bracket',
  history: [
    { price: 7.5, quantity: 12, rev: 'C', details: 'deburr', material: '6061', finish: 'anodize', job_number: '100', created_at: '2024-01-01' },
  ],
};

beforeEach(() => {
  localStorage.setItem('token', 'x');
  apiFetch.mockResolvedValue({ ok: true, status: 200, json: async () => [PART] });
});

test('picking a history entry leaves Material and Finish blank but fills the rest', async () => {
  let view;
  await act(async () => { view = render(<AddPart jobId={1} />); });
  const c = view.container;
  const input = (placeholder) => c.querySelector(`[placeholder="${placeholder}"]`);
  const click = async (el) => act(async () => { el.click(); });

  const search = input('Search by part number or description...');
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(search, 'A1');
    search.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await click([...c.querySelectorAll('button')].find((b) => b.textContent === 'Search'));
  await click([...c.querySelectorAll('strong')].find((d) => d.textContent === 'A1'));
  await click([...c.querySelectorAll('strong')].find((d) => d.textContent === 'Job:'));

  expect(input('Unit Price').value).toBe('7.5');
  expect(input('Quantity').value).toBe('12');
  expect(input('Revision').value).toBe('C');
  expect(input('Details').value).toBe('deburr');
  expect(input('Material').value).toBe('');
  expect(input('Finish').value).toBe('');
  view.unmount();
});
