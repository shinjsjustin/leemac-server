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
