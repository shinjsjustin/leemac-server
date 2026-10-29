import React, { act } from 'react';
import { render } from '../../testUtils/render';
import AdminLayout from './AdminLayout';
import { apiFetch } from '../../api/apiFetch';

jest.mock('../../api/apiFetch');

global.IS_REACT_ACT_ENVIRONMENT = true;

const tokenFor = (claims) => {
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${enc({ alg: 'HS256', typ: 'JWT' })}.${enc(claims)}.sig`;
};
const BADGES = { active_parts: 13, new_requests: 3, waiting_invoices: 9 };

const mount = async (access) => {
  localStorage.setItem('token', tokenFor({ role: 'admin', id: 1, email: 'bourne@leemac.com', access }));
  let view;
  await act(async () => {
    view = render(
      <AdminLayout current="overview" crumb="Shop floor / Overview" actions={<button>Export</button>}>
        <p>body</p>
      </AdminLayout>
    );
  });
  return view;
};
const rail = (c) => c.querySelector('nav[aria-label="Admin"]');
const links = (c) => [...rail(c).querySelectorAll('a')];
const labels = (c) => links(c).map((a) => a.querySelector('.admin-label').textContent);
const badgeFor = (c, label) => links(c).find((a) => a.querySelector('.admin-label').textContent === label).querySelector('.admin-badge')?.textContent;

beforeEach(() => {
  localStorage.clear();
  apiFetch.mockReset();
  apiFetch.mockResolvedValue({ ok: true, json: async () => BADGES });
});

describe('AdminLayout', () => {
  it('renders the shell with rail, crumb, search, actions and children', async () => {
    const view = await mount(3);
    const c = view.container;
    expect(c.querySelector('.admin-shell')).not.toBeNull();
    expect(c.querySelector('.admin-crumb').textContent).toBe('Shop floor / Overview');
    expect(c.querySelector('.admin-top input')).not.toBeNull();
    expect(c.querySelector('.admin-top').textContent).toContain('Export');
    expect(c.querySelector('main').textContent).toContain('body');
    expect(labels(c)).toEqual([
      'New job', 'Overview', 'Jobs', 'Parts', 'Shop update', 'Notes', 'Quote requests', 'Clients',
      'Invoices', 'Expenses', 'Finances', 'Admins', 'Settings',
    ]);
    view.unmount();
  });

  it('marks the current item and shows email, level and Logout', async () => {
    const view = await mount(3);
    const c = view.container;
    expect(rail(c).querySelector('[aria-current="page"]').textContent).toContain('Overview');
    expect(c.querySelector('.admin-me').textContent).toContain('bourne@leemac.com');
    expect(c.querySelector('.admin-me').textContent).toContain('Level 3');
    expect(c.querySelector('.admin-me button').textContent).toBe('Logout');
    view.unmount();
  });

  it('shows badge counts from /internal/badges on Overview, Quote requests and Invoices', async () => {
    const view = await mount(3);
    expect(apiFetch).toHaveBeenCalledWith('/internal/badges');
    expect(badgeFor(view.container, 'Overview')).toBe('13');
    expect(badgeFor(view.container, 'Quote requests')).toBe('3');
    expect(badgeFor(view.container, 'Invoices')).toBe('9');
    expect(badgeFor(view.container, 'Jobs')).toBeUndefined();
    view.unmount();
  });

  it('hides Money, Admins and New job from a level-1 token', async () => {
    apiFetch.mockResolvedValue({ ok: true, json: async () => ({ active_parts: 1, new_requests: 0 }) });
    const view = await mount(1);
    const c = view.container;
    expect(labels(c)).toEqual(['Overview', 'Shop update', 'Notes', 'Settings']);
    expect(c.textContent).not.toContain('Money');
    expect(badgeFor(c, 'Overview')).toBe('1');
    view.unmount();
  });

  it('still renders the page when badges fail', async () => {
    apiFetch.mockRejectedValue(new Error('down'));
    const view = await mount(3);
    expect(view.container.querySelector('main').textContent).toContain('body');
    expect(badgeFor(view.container, 'Overview')).toBeUndefined();
    view.unmount();
  });

  it('still renders the page when badges respond with an error status', async () => {
    apiFetch.mockResolvedValue({ ok: false, json: async () => ({ error: 'x' }) });
    const view = await mount(3);
    expect(view.container.querySelector('main').textContent).toContain('body');
    expect(badgeFor(view.container, 'Overview')).toBeUndefined();
    view.unmount();
  });
});
