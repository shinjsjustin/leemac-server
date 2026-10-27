import React, { act } from 'react';
import { render } from '../../testUtils/render';
import AcceptInvite from './AcceptInvite';

global.IS_REACT_ACT_ENVIRONMENT = true;

let view;
const mount = () => {
  view = render(<AcceptInvite />, { path: '/accept-invite?token=abc' });
  return view.container;
};

const type = (input, value) => act(async () => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
});

beforeEach(() => { global.fetch = jest.fn(); });
afterEach(() => view && view.unmount());

describe('AcceptInvite', () => {
  it('shows the portal shell with no nav and two labelled new-password inputs', () => {
    const c = mount();
    expect(c.querySelector('.portal-shell')).not.toBeNull();
    expect(c.querySelector('nav')).toBeNull();
    const inputs = c.querySelectorAll('form.portal-form input.portal-input');
    expect(inputs).toHaveLength(2);
    inputs.forEach((input) => {
      expect(input.getAttribute('type')).toBe('password');
      expect(input.getAttribute('autocomplete')).toBe('new-password');
      const label = c.querySelector(`label.portal-label[for="${input.id}"]`);
      expect(input.id).not.toBe('');
      expect(label).not.toBeNull();
    });
    expect(c.querySelector('button.portal-button[type="submit"]').textContent).toBe('Set password');
  });

  it('shows Passwords do not match in .portal-error without calling fetch', async () => {
    const c = mount();
    const [a, b] = c.querySelectorAll('input');
    await type(a, 'one');
    await type(b, 'two');
    await act(async () => { c.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    const error = c.querySelector('p.portal-error');
    expect(error.textContent).toBe('Passwords do not match');
    expect(error.getAttribute('role')).toBe('alert');
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
