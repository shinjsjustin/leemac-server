import React, { act } from 'react';
import { render } from '../../testUtils/render';
import Settings from './Settings';
import { apiFetch } from '../../api/apiFetch';
import { jwtDecode } from 'jwt-decode';

jest.mock('../../api/apiFetch', () => ({ apiFetch: jest.fn() }));
jest.mock('jwt-decode', () => ({ jwtDecode: jest.fn() }));
jest.mock('../AdminLayout/AdminLayout', () => ({ current, crumb, children }) => (
  <div data-current={current} data-crumb={crumb}>{children}</div>
));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const json = (ok, data) => Promise.resolve({ ok, json: () => Promise.resolve(data) });

async function mount(access, path = '/settings') {
  jwtDecode.mockReturnValue({ role: 'admin', access });
  localStorage.setItem('token', 'x');
  let view;
  await act(async () => {
    view = render(<Settings />, { path });
  });
  return view;
}

const click = async (el) => {
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};

const byText = (view, tag, text) =>
  [...view.container.querySelectorAll(tag)].find((e) => e.textContent.trim() === text);

beforeEach(() => {
  apiFetch.mockReset();
  localStorage.clear();
});

test('renders in AdminLayout as settings with an Update credentials link for access 1', async () => {
  const view = await mount(1);
  const layout = view.container.firstChild;
  expect(layout.dataset.current).toBe('settings');
  expect(layout.dataset.crumb).toBe('Settings');
  expect(byText(view, 'a', 'Update credentials').getAttribute('href')).toBe('/admin-update-credentials');
  expect(byText(view, 'button', 'Connect Google')).toBeUndefined();
  expect(byText(view, 'button', 'Check Gmail')).toBeUndefined();
  expect(byText(view, 'a', 'Register clients')).toBeUndefined();
});

test('Connect Google redirects to the returned authUrl at access 3', async () => {
  apiFetch.mockReturnValue(json(true, { authUrl: 'http://localhost/#google-consent' }));
  const view = await mount(3);
  await click(byText(view, 'button', 'Connect Google'));
  expect(apiFetch).toHaveBeenCalledWith('/jarvis/google/auth-url');
  expect(window.location.hash).toBe('#google-consent');
});

test('Check Gmail shows the count and only the first five from and subject lines', async () => {
  const emails = Array.from({ length: 7 }, (_, i) => ({ from: `f${i}@x.com`, subject: `Subj ${i}` }));
  apiFetch.mockReturnValue(json(true, { count: 7, emails }));
  const view = await mount(3);
  await click(byText(view, 'button', 'Check Gmail'));
  expect(apiFetch).toHaveBeenCalledWith('/jarvis/google/check');
  const text = view.container.textContent;
  expect(text).toContain('7');
  expect(text).toContain('f4@x.com');
  expect(text).toContain('Subj 4');
  expect(text).not.toContain('f5@x.com');
});

test('Check Gmail shows the server error on the page', async () => {
  apiFetch.mockReturnValue(json(false, { error: 'Gmail not connected' }));
  const view = await mount(3);
  await click(byText(view, 'button', 'Check Gmail'));
  expect(view.container.textContent).toContain('Gmail not connected');
});

test('level 3 gets a Register clients link', async () => {
  const view = await mount(3);
  expect(byText(view, 'a', 'Register clients').getAttribute('href')).toBe('/client-register');
});

test('shows success line for google_connected=1', async () => {
  const view = await mount(1, '/settings?google_connected=1');
  expect(view.container.textContent).toContain('Google connected');
});

test('shows error line for google_error', async () => {
  const view = await mount(1, '/settings?google_error=access_denied');
  expect(view.container.textContent).toContain('access_denied');
});
