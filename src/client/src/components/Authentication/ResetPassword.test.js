import React, { act } from 'react';
import { render } from '../../testUtils/render';
import ResetPassword from './ResetPassword';

global.IS_REACT_ACT_ENVIRONMENT = true;

let view;
const mount = (path) => {
  view = render(<ResetPassword />, { path });
  return view.container;
};

const type = (input, value) => act(async () => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
});

const resetWith = async (c) => {
  const [a, b] = c.querySelectorAll('input[type="password"]');
  await type(a, 'newpw');
  await type(b, 'newpw');
  await act(async () => {
    c.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
};

const logIn = (c) => [...c.querySelectorAll('a')].find((a) => a.textContent === 'Log in');

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, headers: { get: () => null }, json: async () => ({}) });
});
afterEach(() => view && view.unmount());

describe('ResetPassword', () => {
  it('posts token and newPassword to /client/reset-password and links to /client-login on success', async () => {
    const c = mount('/reset-password?type=client&token=tok1');
    await resetWith(c);
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toMatch(/\/client\/reset-password$/);
    expect(JSON.parse(options.body)).toEqual({ token: 'tok1', newPassword: 'newpw' });
    expect(logIn(c).getAttribute('href')).toBe('/client-login');
  });

  it('posts to /admin/reset-password and links to /login-admin for admin', async () => {
    const c = mount('/reset-password?type=admin&token=tok2');
    await resetWith(c);
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toMatch(/\/admin\/reset-password$/);
    expect(JSON.parse(options.body)).toEqual({ token: 'tok2', newPassword: 'newpw' });
    expect(logIn(c).getAttribute('href')).toBe('/login-admin');
  });
});
