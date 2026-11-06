import React, { act } from 'react';
import { render } from '../../testUtils/render';
import Settings from './Settings';
import { jwtDecode } from 'jwt-decode';

jest.mock('jwt-decode', () => ({ jwtDecode: jest.fn() }));
jest.mock('../AdminLayout/AdminLayout', () => ({ current, crumb, children }) => (
  <div data-current={current} data-crumb={crumb}>{children}</div>
));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

async function mount(access, path = '/settings') {
  jwtDecode.mockReturnValue({ role: 'admin', access });
  localStorage.setItem('token', 'x');
  let view;
  await act(async () => {
    view = render(<Settings />, { path });
  });
  return view;
}

const byText = (view, tag, text) =>
  [...view.container.querySelectorAll(tag)].find((e) => e.textContent.trim() === text);

beforeEach(() => {
  localStorage.clear();
});

test('renders in AdminLayout as settings with an Update credentials link for access 1', async () => {
  const view = await mount(1);
  const layout = view.container.firstChild;
  expect(layout.dataset.current).toBe('settings');
  expect(layout.dataset.crumb).toBe('Settings');
  expect(byText(view, 'a', 'Update credentials').getAttribute('href')).toBe('/admin-update-credentials');
  expect(byText(view, 'a', 'Register clients')).toBeUndefined();
});

test('level 3 gets a Register clients link', async () => {
  const view = await mount(3);
  expect(byText(view, 'a', 'Register clients').getAttribute('href')).toBe('/client-register');
});
