import React, { act } from 'react';
import { render } from '../../testUtils/render';
import ForgotPassword from './ForgotPassword';

global.IS_REACT_ACT_ENVIRONMENT = true;

let view;
const mount = (path) => {
  view = render(<ForgotPassword />, { path });
  return view.container;
};

const type = (input, value) => act(async () => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
});

const submit = (c) => act(async () => {
  c.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
});

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, headers: { get: () => null }, json: async () => ({}) });
});
afterEach(() => view && view.unmount());

describe('ForgotPassword', () => {
  it('posts the email to /client/forgot-password with no type picker when type=client', async () => {
    const c = mount('/forgot-password?type=client');
    expect(c.querySelector('select')).toBeNull();
    await type(c.querySelector('input[type="email"]'), 'a@x.com');
    await submit(c);
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toMatch(/\/client\/forgot-password$/);
    expect(JSON.parse(options.body)).toEqual({ email: 'a@x.com' });
  });

  it('links back to /client-login when type=client', () => {
    const c = mount('/forgot-password?type=client');
    const hrefs = [...c.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(hrefs).toContain('/client-login');
  });

  it('posts to /admin/forgot-password when there is no query', async () => {
    const c = mount('/forgot-password');
    expect(c.querySelector('select').value).toBe('admin');
    await type(c.querySelector('input[type="email"]'), 'b@x.com');
    await submit(c);
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toMatch(/\/admin\/forgot-password$/);
    expect(JSON.parse(options.body)).toEqual({ email: 'b@x.com' });
  });
});
