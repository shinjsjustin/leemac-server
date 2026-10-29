import React, { act } from 'react';
import { render } from '../../testUtils/render';
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
    const [current, next] = form.querySelectorAll('input[type="password"]');
    expect(current.getAttribute('autocomplete')).toBe('current-password');
    expect(next.getAttribute('autocomplete')).toBe('new-password');
    [current, next].forEach((input) => {
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
});
