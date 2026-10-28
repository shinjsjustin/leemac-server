import React, { act } from 'react';
import { render } from '../../testUtils/render';
import PartList from './PartList';
import { apiFetch } from '../../api/apiFetch';

jest.mock('../Navbar', () => () => null);
jest.mock('../../api/apiFetch', () => ({ apiFetch: jest.fn() }));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => {
  sessionStorage.clear();
  apiFetch.mockResolvedValue({
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    json: async () => [],
  });
});

test('fetches with the saved search and fills the number input', async () => {
  sessionStorage.setItem('adminPartListSearch', JSON.stringify({ number: 'A1' }));
  let view;
  await act(async () => {
    view = render(<PartList />);
  });
  expect(apiFetch).toHaveBeenCalledWith('/internal/part/getparts?number=A1&description=');
  expect(view.container.querySelector('input[placeholder="NUMBER SEARCH"]').value).toBe('A1');
  view.unmount();
});
