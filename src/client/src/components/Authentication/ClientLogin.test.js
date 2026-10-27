import React, { act } from 'react';
import { render } from '../../testUtils/render';
import ClientLogin from './ClientLogin';

global.IS_REACT_ACT_ENVIRONMENT = true;

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

let view;
const mount = () => {
  view = render(<ClientLogin />);
  return view.container;
};

beforeEach(() => { global.fetch = jest.fn(); });
afterEach(() => view && view.unmount());

describe('ClientLogin', () => {
  it('renders inside the portal shell without nav', () => {
    const c = mount();
    expect(c.querySelector('.portal-shell')).not.toBeNull();
    expect(c.querySelector('nav')).toBeNull();
  });

  it('has a labelled email input and a password input with autocomplete', () => {
    const c = mount();
    const email = c.querySelector('input[type="email"]');
    expect(email.id).toBeTruthy();
    expect(email.getAttribute('autocomplete')).toBe('email');
    const label = c.querySelector(`label[for="${email.id}"]`);
    expect(label).not.toBeNull();
    expect(label.className).toContain('portal-label');
    const password = c.querySelector('input[type="password"]');
    expect(password.getAttribute('autocomplete')).toBe('current-password');
    expect(c.querySelector(`label[for="${password.id}"]`)).not.toBeNull();
  });

  it('shows the error text of a 401 response in .portal-error', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      headers: { get: () => null },
      json: async () => ({ error: 'Invalid credentials' }),
    });
    const c = mount();
    await act(async () => {
      c.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await flush();
    const err = c.querySelector('.portal-error');
    expect(err.textContent).toBe('Invalid credentials');
    expect(err.getAttribute('role')).toBe('alert');
  });
});
