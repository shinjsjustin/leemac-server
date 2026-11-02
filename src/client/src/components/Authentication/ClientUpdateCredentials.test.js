import React, { act } from 'react';
import { render } from '../../testUtils/render';
import { Simulate } from 'react-dom/test-utils';
import ClientUpdateCredentials from './ClientUpdateCredentials';

global.IS_REACT_ACT_ENVIRONMENT = true;

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const mfaStatus = (enabled) => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => ({ enabled }) });

let view;
const mount = async () => {
  global.fetch.mockResolvedValue(mfaStatus(false));
  view = render(<ClientUpdateCredentials />);
  await flush();
  return view.container;
};

beforeEach(() => { global.fetch = jest.fn(); });
afterEach(() => view && view.unmount());

describe('ClientUpdateCredentials', () => {
  it('renders in the portal shell with the Portal and Tabs navs and no admin navbar', async () => {
    const c = await mount();
    expect(c.querySelector('.portal-shell')).not.toBeNull();
    expect(c.querySelector('h1').textContent).toBe('Account');
    expect([...c.querySelectorAll('nav')].map((n) => n.getAttribute('aria-label'))).toEqual(['Portal', 'Tabs']);
    expect(c.querySelector('.profile-icon')).toBeNull();
  });

  it('labels the password inputs with matching autocomplete values', async () => {
    const c = await mount();
    const form = c.querySelector('form.portal-form');
    const [current, next, confirm] = form.querySelectorAll('input[type="password"]');
    expect(current.getAttribute('autocomplete')).toBe('current-password');
    expect(next.getAttribute('autocomplete')).toBe('new-password');
    expect(confirm.getAttribute('autocomplete')).toBe('new-password');
    expect(c.querySelector(`label[for="${confirm.id}"]`).textContent).toBe('Confirm new password');
    [current, next, confirm].forEach((input) => {
      expect(input.id).toBeTruthy();
      expect(c.querySelector(`label.portal-label[for="${input.id}"]`)).not.toBeNull();
      expect(input.className).toContain('portal-input');
    });
    expect(form.querySelector('button.portal-button[type="submit"]')).not.toBeNull();
  });

  it('has no inline styles or back button', async () => {
    const c = await mount();
    expect(c.querySelector('[style]')).toBeNull();
    expect(c.textContent).not.toContain('Back');
  });

  it('titles the password form Update password with a matching submit button', async () => {
    const c = await mount();
    const form = c.querySelector('form.portal-form');
    expect(form.firstElementChild.tagName).toBe('H2');
    expect(form.firstElementChild.textContent).toBe('Update password');
    expect(form.querySelector('button[type="submit"]').textContent).toBe('Update password');
  });

  it('no longer says Update Credentials and shows two cards', async () => {
    const c = await mount();
    expect(c.textContent).not.toContain('Update Credentials');
    expect(c.querySelectorAll('.portal-form')).toHaveLength(2);
  });

  const fill = async (c, values) => {
    const [current, next, confirm] = c.querySelectorAll('form.portal-form input[type="password"]');
    [[current, values[0]], [next, values[1]], [confirm, values[2]]].forEach(([input, value]) => {
      input.value = value;
      act(() => { Simulate.change(input); });
    });
    await act(async () => { Simulate.submit(c.querySelector('form.portal-form')); });
    await flush();
  };
  const putCalls = () => global.fetch.mock.calls.filter(([url]) => url.includes('/client/change-password'));

  it('shows Passwords do not match and sends nothing when confirmation differs', async () => {
    const c = await mount();
    global.fetch.mockClear();
    await fill(c, ['old-pass', 'new-pass-1', 'new-pass-2']);
    expect(c.textContent).toContain('Passwords do not match');
    expect(putCalls()).toHaveLength(0);
  });

  it('PUTs exactly currentPassword and newPassword when the passwords match', async () => {
    const c = await mount();
    global.fetch.mockClear();
    global.fetch.mockResolvedValue({ ok: true, status: 200, headers: { get: () => null }, json: async () => ({}) });
    window.alert = jest.fn();
    await fill(c, ['old-pass', 'new-pass-1', 'new-pass-1']);
    expect(putCalls()).toHaveLength(1);
    const [, options] = putCalls()[0];
    expect(options.method).toBe('PUT');
    expect(JSON.parse(options.body)).toEqual({ currentPassword: 'old-pass', newPassword: 'new-pass-1' });
  });
});
