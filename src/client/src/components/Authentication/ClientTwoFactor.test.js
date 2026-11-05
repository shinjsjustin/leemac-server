import React, { act } from 'react';
import { render } from '../../testUtils/render';
import ClientTwoFactor from './ClientTwoFactor';

global.IS_REACT_ACT_ENVIRONMENT = true;

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

let view;
beforeEach(() => { global.fetch = jest.fn(); mockNavigate.mockClear(); localStorage.clear(); sessionStorage.clear(); });
afterEach(() => view && view.unmount());

describe('ClientTwoFactor', () => {
  it('renders inside the portal shell with a labelled one-time-code input', () => {
    view = render(<ClientTwoFactor />);
    const c = view.container;
    expect(c.querySelector('.portal-shell')).not.toBeNull();
    expect(c.querySelector('nav')).toBeNull();
    const input = c.querySelector('input.portal-input');
    expect(input.id).toBeTruthy();
    expect(input.getAttribute('autocomplete')).toBe('one-time-code');
    expect(input.getAttribute('inputmode')).toBe('numeric');
    const label = c.querySelector(`label.portal-label[for="${input.id}"]`);
    expect(label).not.toBeNull();
  });

  it('navigates to /client-overview after a verified code', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ token: 'jwt-2' }),
    });
    view = render(<ClientTwoFactor />);
    const c = view.container;
    await act(async () => { c.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(localStorage.getItem('token')).toBe('jwt-2');
    expect(mockNavigate).toHaveBeenCalledWith('/client-overview');
  });
});

describe('ClientTwoFactor return path', () => {
  const NEXT = `/client-shared/${'a'.repeat(43)}`;
  const verify = async (search, response) => {
    global.fetch.mockResolvedValueOnce({ headers: { get: () => null }, json: async () => ({}), ...response });
    view = render(<ClientTwoFactor />, { path: `/client-two-factor${search}` });
    await act(async () => { view.container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  };
  const ok = { ok: true, status: 200, json: async () => ({ token: 'jwt-2' }) };

  it('goes to a valid next after verify', async () => {
    await verify(`?next=${encodeURIComponent(NEXT)}`, ok);
    expect(mockNavigate).toHaveBeenCalledWith(NEXT);
  });

  it('falls back to /client-overview for an invalid next', async () => {
    await verify('?next=%2Fclient-parts', ok);
    expect(mockNavigate).toHaveBeenCalledWith('/client-overview');
  });

  it('keeps a valid next when a 401 returns to /client-login', async () => {
    await verify(`?next=${encodeURIComponent(NEXT)}`, { ok: false, status: 401 });
    expect(mockNavigate).toHaveBeenCalledWith(`/client-login?next=${encodeURIComponent(NEXT)}`);
  });

  it('returns to plain /client-login on a 401 without a valid next', async () => {
    await verify('', { ok: false, status: 401 });
    expect(mockNavigate).toHaveBeenCalledWith('/client-login');
  });
});
