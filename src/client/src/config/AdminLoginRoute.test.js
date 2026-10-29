import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import AdminLoginRoute from './AdminLoginRoute';

global.IS_REACT_ACT_ENVIRONMENT = true;

const fakeToken = (payload) => {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}.sig`;
};
const future = Math.floor(Date.now() / 1000) + 3600;
const past = Math.floor(Date.now() / 1000) - 3600;
const adminToken = fakeToken({ role: 'admin', access: 1, exp: future });
const expiredAdmin = fakeToken({ role: 'admin', access: 3, exp: past });
const noAccessAdmin = fakeToken({ role: 'admin', exp: future });
const clientToken = fakeToken({ role: 'client', company_id: 7, exp: future });

const Where = () => <div data-testid="where">{useLocation().pathname}</div>;

function renderLogin() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <MemoryRouter initialEntries={['/login-admin']}>
        <Routes>
          <Route
            path="/login-admin"
            element={<AdminLoginRoute><div>LOGIN FORM</div></AdminLoginRoute>}
          />
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>
    );
  });
  return container;
}

afterEach(() => {
  localStorage.clear();
  document.body.innerHTML = '';
});

describe('AdminLoginRoute', () => {
  test('valid admin token goes to /starred-jobs and is kept', () => {
    localStorage.setItem('token', adminToken);
    const c = renderLogin();
    expect(c.querySelector('[data-testid=where]').textContent).toBe('/starred-jobs');
    expect(localStorage.getItem('token')).toBe(adminToken);
  });

  test.each([
    ['expired admin', expiredAdmin],
    ['malformed string', 'not-a-jwt'],
    ['admin without access', noAccessAdmin],
  ])('%s shows the form and clears the token', (_name, token) => {
    localStorage.setItem('token', token);
    const c = renderLogin();
    expect(c.textContent).toBe('LOGIN FORM');
    expect(localStorage.getItem('token')).toBeNull();
  });

  test('client token shows the form and keeps the token', () => {
    localStorage.setItem('token', clientToken);
    const c = renderLogin();
    expect(c.textContent).toBe('LOGIN FORM');
    expect(localStorage.getItem('token')).toBe(clientToken);
  });

  test('no token shows the form', () => {
    expect(renderLogin().textContent).toBe('LOGIN FORM');
  });
});
