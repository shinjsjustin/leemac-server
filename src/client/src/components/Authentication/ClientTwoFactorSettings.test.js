import React, { act } from 'react';
import { render } from '../../testUtils/render';
import ClientTwoFactorSettings from './ClientTwoFactorSettings';

global.IS_REACT_ACT_ENVIRONMENT = true;

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const reply = (body, over = {}) => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => body, ...over });

let view;
const mount = async () => {
  view = render(<ClientTwoFactorSettings />);
  await flush();
  return view.container;
};

beforeEach(() => { global.fetch = jest.fn(); });
afterEach(() => view && view.unmount());

describe('ClientTwoFactorSettings', () => {
  it('labels the one-time code input after setup', async () => {
    global.fetch
      .mockResolvedValueOnce(reply({ enabled: false }))
      .mockResolvedValueOnce(reply({ secret: 'ABC', qr: null }));
    const c = await mount();
    expect(c.querySelector('section.portal-form')).not.toBeNull();
    const turnOn = c.querySelector('button.portal-button');
    await act(async () => { turnOn.click(); });
    await flush();
    const input = c.querySelector('input');
    expect(input.getAttribute('autocomplete')).toBe('one-time-code');
    expect(input.getAttribute('inputmode')).toBe('numeric');
    expect(c.querySelector(`label.portal-label[for="${input.id}"]`)).not.toBeNull();
  });

  it('labels the password input when two-factor is on', async () => {
    global.fetch.mockResolvedValueOnce(reply({ enabled: true }));
    const c = await mount();
    const input = c.querySelector('input[type="password"]');
    expect(input.getAttribute('autocomplete')).toBe('current-password');
    expect(input.id).toBeTruthy();
    expect(c.querySelector(`label.portal-label[for="${input.id}"]`)).not.toBeNull();
  });

  it('shows errors in p.portal-error', async () => {
    global.fetch.mockResolvedValueOnce(reply({ error: 'Nope' }, { ok: false, status: 500 }));
    const c = await mount();
    expect(c.querySelector('p.portal-error').textContent).toBe('Nope');
  });

  it('spaces the setup form with portal-stack', async () => {
    global.fetch
      .mockResolvedValueOnce(reply({ enabled: false }))
      .mockResolvedValueOnce(reply({ secret: 'ABC', qr: null }));
    const c = await mount();
    await act(async () => { c.querySelector('button.portal-button').click(); });
    await flush();
    expect(c.querySelector('form').className).toContain('portal-stack');
  });

  it('spaces the turn-off form with portal-stack', async () => {
    global.fetch.mockResolvedValueOnce(reply({ enabled: true }));
    const c = await mount();
    expect(c.querySelector('form').className).toContain('portal-stack');
  });
});
