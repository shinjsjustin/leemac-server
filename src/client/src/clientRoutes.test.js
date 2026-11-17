import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import clientRoutes from './clientRoutes';

jest.mock('./components/ClientComponents/ClientHome', () => () => <div>HOME PAGE</div>);
jest.mock('./components/ClientComponents/ClientOverview', () => () => <div>OVERVIEW PAGE</div>);
jest.mock('./components/ClientComponents/ClientJob', () => () => <div>JOB PAGE</div>);
jest.mock('./components/ClientComponents/ClientPartsPage', () => () => <div>PARTS PAGE</div>);
jest.mock('./components/ClientComponents/ClientSharedList', () => () => <div>SHARED LIST PAGE</div>);
jest.mock('./components/ClientComponents/ClientPartPage', () => () => <div>PART PAGE</div>);
jest.mock('./components/ClientComponents/ClientRequestsPage', () => () => <div>REQUESTS PAGE</div>);
jest.mock('./components/ClientComponents/ClientRequestPage', () => () => <div>REQUEST PAGE</div>);
jest.mock('./components/ClientComponents/ShareQuotePage', () => () => <div>SHARE QUOTE PAGE</div>);
jest.mock('./components/ClientComponents/UserGuide', () => () => <div>GUIDE PAGE</div>);

global.IS_REACT_ACT_ENVIRONMENT = true;

const fakeToken = (payload) => {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}.sig`;
};
const future = Math.floor(Date.now() / 1000) + 3600;
const clientToken = fakeToken({ role: 'client', company_id: 7, exp: future });
const adminToken = fakeToken({ role: 'admin', access: 3, exp: future });

const Where = () => <div data-testid="where">{useLocation().pathname}</div>;
const WhereFull = () => { const l = useLocation(); return <div data-testid="where">{l.pathname + l.search}</div>; };

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
          <Route path="/client-login" element={<WhereFull />} />
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
    ['/client-parts/shared/4', 'SHARED LIST PAGE'],
    ['/client-requests', 'REQUESTS PAGE'],
    ['/client-request/new', 'REQUEST PAGE'],
    ['/client-request/5', 'REQUEST PAGE'],
    ['/client-guide', 'GUIDE PAGE'],
  ])('%s renders the part page for a client', (path, text) => {
    localStorage.setItem('token', clientToken);
    const c = renderAt(path);
    expect(c.textContent).toBe(text);
  });

  test.each([
    ['/client-overview'],
    ['/client-parts'],
    ['/client-part/5'],
    ['/client-parts/shared/4'],
    ['/client-requests'],
    ['/client-request/new'],
    ['/client-request/5'],
    ['/client-home'],
    ['/client-job/3'],
    ['/client-guide'],
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

  describe.each([['/client-part/5', 'PART PAGE'], ['/client-job/3', 'JOB PAGE']])('%s', (path, text) => {
    const toLogin = `/client-login?next=${encodeURIComponent(path)}`;
    const where = () => renderAt(path).querySelector('[data-testid=where]').textContent;

    test('with no token goes to login with next set', () => {
      expect(where()).toBe(toLogin);
    });

    test('with an expired token removes it and goes to login with next set', () => {
      localStorage.setItem('token', fakeToken({ role: 'client', company_id: 7, exp: 1 }));
      expect(where()).toBe(toLogin);
      expect(localStorage.getItem('token')).toBeNull();
    });

    test('with an unreadable token removes it and goes to login with next set', () => {
      localStorage.setItem('token', 'garbage');
      expect(where()).toBe(toLogin);
      expect(localStorage.getItem('token')).toBeNull();
    });

    test('with an admin token goes to /access-denied and keeps the token', () => {
      localStorage.setItem('token', adminToken);
      expect(where()).toBe('/access-denied');
      expect(localStorage.getItem('token')).toBe(adminToken);
    });

    test('with a client token renders the page', () => {
      localStorage.setItem('token', clientToken);
      expect(renderAt(path).textContent).toBe(text);
    });
  });

  test('missing token on /client-guide goes to /access-denied', () => {
    expect(renderAt('/client-guide').querySelector('[data-testid=where]').textContent).toBe('/access-denied');
  });

  describe('/client-shared/:token', () => {
    const SHARED = `/client-shared/${'a'.repeat(43)}`;
    const toLogin = `/client-login?next=${encodeURIComponent(SHARED)}`;

    test('with no token sends the visitor to /client-login with next set', () => {
      expect(renderAt(SHARED).querySelector('[data-testid=where]').textContent).toBe(toLogin);
    });

    test('with an expired client token removes it and sends the visitor to login', () => {
      localStorage.setItem('token', fakeToken({ role: 'client', company_id: 7, exp: 1 }));
      expect(renderAt(SHARED).querySelector('[data-testid=where]').textContent).toBe(toLogin);
      expect(localStorage.getItem('token')).toBeNull();
    });

    test('with an unreadable token removes it and sends the visitor to login', () => {
      localStorage.setItem('token', 'garbage');
      expect(renderAt(SHARED).querySelector('[data-testid=where]').textContent).toBe(toLogin);
      expect(localStorage.getItem('token')).toBeNull();
    });

    test('with an admin token goes to /access-denied and keeps the token', () => {
      localStorage.setItem('token', adminToken);
      expect(renderAt(SHARED).querySelector('[data-testid=where]').textContent).toBe('/access-denied');
      expect(localStorage.getItem('token')).toBe(adminToken);
    });
  });

  describe('/share/quote/:token', () => {
    const SHARE = `/share/quote/${'a'.repeat(43)}`;

    test('renders with no token', () => {
      expect(renderAt(SHARE).textContent).toBe('SHARE QUOTE PAGE');
    });

    test('renders with a client token', () => {
      localStorage.setItem('token', clientToken);
      expect(renderAt(SHARE).textContent).toBe('SHARE QUOTE PAGE');
    });
  });
});
