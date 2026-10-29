import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import clientRoutes from './clientRoutes';

jest.mock('./components/ClientComponents/ClientHome', () => () => <div>HOME PAGE</div>);
jest.mock('./components/ClientComponents/ClientOverview', () => () => <div>OVERVIEW PAGE</div>);
jest.mock('./components/ClientComponents/ClientJob', () => () => <div>JOB PAGE</div>);
jest.mock('./components/ClientComponents/ClientPartsPage', () => () => <div>PARTS PAGE</div>);
jest.mock('./components/ClientComponents/ClientPartPage', () => () => <div>PART PAGE</div>);
jest.mock('./components/ClientComponents/ClientRequestsPage', () => () => <div>REQUESTS PAGE</div>);
jest.mock('./components/ClientComponents/ClientRequestPage', () => () => <div>REQUEST PAGE</div>);

global.IS_REACT_ACT_ENVIRONMENT = true;

const fakeToken = (payload) => {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}.sig`;
};
const future = Math.floor(Date.now() / 1000) + 3600;
const clientToken = fakeToken({ role: 'client', company_id: 7, exp: future });
const adminToken = fakeToken({ role: 'admin', access: 3, exp: future });

const Where = () => <div data-testid="where">{useLocation().pathname}</div>;

function renderAt(path) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          {clientRoutes.map((r) => <Route key={r.path} path={r.path} element={r.element} />)}
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

describe('clientRoutes', () => {
  test.each([
    ['/client-overview', 'OVERVIEW PAGE'],
    ['/client-parts', 'PARTS PAGE'],
    ['/client-part/5', 'PART PAGE'],
    ['/client-requests', 'REQUESTS PAGE'],
    ['/client-request/new', 'REQUEST PAGE'],
    ['/client-request/5', 'REQUEST PAGE'],
  ])('%s renders the part page for a client', (path, text) => {
    localStorage.setItem('token', clientToken);
    const c = renderAt(path);
    expect(c.textContent).toBe(text);
  });

  test.each([
    ['/client-overview'],
    ['/client-parts'],
    ['/client-part/5'],
    ['/client-requests'],
    ['/client-request/new'],
    ['/client-request/5'],
    ['/client-home'],
    ['/client-job/3'],
  ])('%s sends an admin token to /access-denied', (path) => {
    localStorage.setItem('token', adminToken);
    const c = renderAt(path);
    expect(c.querySelector('[data-testid=where]').textContent).toBe('/access-denied');
  });

  test('/client-request with a client token redirects to the requests page', () => {
    localStorage.setItem('token', clientToken);
    expect(renderAt('/client-request').textContent).toBe('REQUESTS PAGE');
  });

  test('client token renders the job page', () => {
    localStorage.setItem('token', clientToken);
    expect(renderAt('/client-job/3').textContent).toContain('JOB PAGE');
  });

  test('missing token on /client-home goes to /access-denied', () => {
    expect(renderAt('/client-home').querySelector('[data-testid=where]').textContent).toBe('/access-denied');
  });
});
