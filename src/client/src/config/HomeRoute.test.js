import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import HomeRoute from './HomeRoute';

global.IS_REACT_ACT_ENVIRONMENT = true;

const fakeToken = (payload) => {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}.sig`;
};
const future = Math.floor(Date.now() / 1000) + 3600;
const past = Math.floor(Date.now() / 1000) - 3600;
const clientToken = fakeToken({ role: 'client', company_id: 7, exp: future });
const expiredClient = fakeToken({ role: 'client', company_id: 7, exp: past });
const adminToken = fakeToken({ role: 'admin', access: 1, exp: future });

const Where = () => <div data-testid="where">{useLocation().pathname}</div>;

function renderHome() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<HomeRoute><div>ABOUT</div></HomeRoute>} />
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

describe('HomeRoute', () => {
  test('valid client token ends on /client-overview and is kept', () => {
    localStorage.setItem('token', clientToken);
    const c = renderHome();
    expect(c.querySelector('[data-testid=where]').textContent).toBe('/client-overview');
    expect(localStorage.getItem('token')).toBe(clientToken);
  });

  test.each([
    ['no token', null],
    ['expired client token', expiredClient],
    ['admin token', adminToken],
    ['malformed string', 'not-a-jwt'],
  ])('%s renders the children and keeps the token', (_name, token) => {
    if (token) localStorage.setItem('token', token);
    const c = renderHome();
    expect(c.textContent).toBe('ABOUT');
    expect(localStorage.getItem('token')).toBe(token);
  });
});
