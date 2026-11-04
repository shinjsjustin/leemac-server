import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import routes from './routes';

jest.mock('./components/AdminComponents/AddParts', () => () => <div>ADD PARTS PAGE</div>);
jest.mock('./components/AdminLayout/AdminLayout', () => ({ children }) => <div>{children}</div>);
jest.mock('./components/Authentication/AccessDenied', () => () => <div>ACCESS DENIED PAGE</div>);

global.IS_REACT_ACT_ENVIRONMENT = true;

const fakeToken = (payload) => {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}.sig`;
};
const future = Math.floor(Date.now() / 1000) + 3600;
const adminToken = (access) => fakeToken({ role: 'admin', access, exp: future });

function renderAt(path) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          {routes.map((r) => <Route key={r.path} path={r.path} element={r.element} />)}
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

describe('routes /add-part', () => {
  test('sends a level 2 token to /access-denied', () => {
    localStorage.setItem('token', adminToken(2));
    expect(renderAt('/add-part').textContent).toBe('ACCESS DENIED PAGE');
  });

  test('renders the AddParts page for a level 3 token', () => {
    localStorage.setItem('token', adminToken(3));
    expect(renderAt('/add-part').textContent).toBe('ADD PARTS PAGE');
  });
});
