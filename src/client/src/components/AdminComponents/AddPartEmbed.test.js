import React, { act } from 'react';
import { render } from '../../testUtils/render';
import AddPart from './AddPart';
import { apiFetch } from '../../api/apiFetch';

jest.mock('../../api/apiFetch', () => ({ apiFetch: jest.fn() }));
jest.mock('jwt-decode', () => ({ jwtDecode: () => ({ access: 2 }) }));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => {
  localStorage.setItem('token', 'x');
  apiFetch.mockResolvedValue({ ok: true, status: 200, json: async () => [] });
});

test('renders without its own admin shell when embedded in a modal', async () => {
  let view;
  await act(async () => { view = render(<AddPart jobId={1} />); });

  expect(view.container.querySelector('.admin-shell')).toBeNull();
  expect(view.container.querySelector('h2.header').textContent).toBe('Add Part');
  view.unmount();
});
