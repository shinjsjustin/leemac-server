import React, { act } from 'react';
import { render } from '../../testUtils/render';
import Login from './Login';

global.IS_REACT_ACT_ENVIRONMENT = true;

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

let view;
const mount = () => {
  view = render(<Login />);
  return view.container;
};

const submit = async (c) => {
  await act(async () => { c.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
  await flush();
};

beforeEach(() => { global.fetch = jest.fn(); mockNavigate.mockClear(); localStorage.clear(); sessionStorage.clear(); });
afterEach(() => view && view.unmount());

describe('Login', () => {
  it('shows the error text of a 400 response', async () => {
    const message = 'This account has no password yet. Use Forgot password to set one.';
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      headers: { get: () => null },
      json: async () => ({ error: message }),
    });
    const c = mount();
    await submit(c);
    expect(c.textContent).toContain(message);
    expect(c.textContent).not.toContain('Server side error');
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('stores the pending token and goes to /two-factor when a code is needed', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ message: 'Two-factor required', step: 'enter_code', pendingToken: 'p1' }),
    });
    const c = mount();
    await submit(c);
    expect(sessionStorage.getItem('mfaPending')).toBe('p1');
    expect(mockNavigate).toHaveBeenCalledWith('/two-factor');
  });
});
