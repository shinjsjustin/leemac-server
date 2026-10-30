import React, { act } from 'react';
import { render } from '../../testUtils/render';
import ClientRequestsPage from './ClientRequestsPage';
import { listRequests } from '../../api/portalRequestsApi';
import { listLists } from '../../api/portalListsApi';

jest.mock('../../api/portalRequestsApi', () => ({
  listRequests: jest.fn(),
  requestStatusLabel: jest.requireActual('../../api/portalRequestsApi').requestStatusLabel,
  formatLocalDate: jest.requireActual('../../api/portalRequestsApi').formatLocalDate,
}));

jest.mock('../../api/portalListsApi', () => ({ listLists: jest.fn() }));

global.IS_REACT_ACT_ENVIRONMENT = true;

const request = (id, over = {}) => ({
  id, name: `Brackets ${id}`, need_by: '2026-11-05', updated_at: '2026-10-20T14:00:00.000Z',
  status: 'draft', price: 99.5, ...over,
});
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

let view;
const mount = async () => {
  view = render(<ClientRequestsPage />);
  await flush();
  return view.container;
};

beforeEach(() => {
  listRequests.mockReset();
  listLists.mockReset();
  listLists.mockResolvedValue({ ok: true, data: [] });
});
afterEach(() => view && view.unmount());

describe('ClientRequestsPage', () => {
  it('renders the rail with a row per request and the new-request link', async () => {
    listRequests.mockResolvedValue({ ok: true, data: [request(7), request(8, { name: '', status: 'sent', job_id: 3 })] });
    const c = await mount();
    expect(c.querySelector('h1').textContent).toBe('Your requests');
    const rows = c.querySelectorAll('a.portal-req-row');
    expect(rows).toHaveLength(2);
    expect(rows[0].getAttribute('href')).toBe('/client-request/7');
    expect(rows[0].textContent).toContain('Brackets 7');
    expect(rows[1].textContent).toContain('Request #8');
    expect(rows[1].textContent).toContain('Job created');
    const link = [...c.querySelectorAll('a')].find((a) => a.textContent === '+ New request' && a.className.includes('portal-button'));
    expect(link.getAttribute('href')).toBe('/client-request/new');
  });

  it('shows lists from listLists and hides that section when listLists fails', async () => {
    listRequests.mockResolvedValue({ ok: true, data: [request(1)] });
    listLists.mockResolvedValue({ ok: true, data: [{ id: 1, name: 'Gears', part_ids: [1, 2] }] });
    let c = await mount();
    expect(c.querySelector('.portal-req-list').textContent).toContain('2 parts');
    view.unmount();
    listLists.mockResolvedValue({ ok: false, error: { kind: 'error', message: 'No' } });
    c = await mount();
    expect(c.textContent).not.toContain('Start from a list');
    expect(c.querySelectorAll('a.portal-req-row')).toHaveLength(1);
  });

  it('shows loading, then the error kind and message on failure', async () => {
    let resolve;
    listRequests.mockReturnValue(new Promise((r) => { resolve = r; }));
    view = render(<ClientRequestsPage />);
    expect(view.container.querySelector('.portal-message h2').textContent).toBe('Loading');
    await act(async () => resolve({ ok: false, error: { kind: 'error', message: 'Boom' } }));
    const alert = view.container.querySelector('.portal-message[role="alert"]');
    expect(alert.textContent).toContain('Boom');
    expect(view.container.querySelector('.portal-req-row')).toBeNull();
  });

  it('shows the empty message inviting a first list', async () => {
    listRequests.mockResolvedValue({ ok: true, data: [] });
    const c = await mount();
    expect(c.querySelector('.portal-message').textContent).toContain('Start a Quick New Parts List');
  });

  it('uses the list grid, not the single-request grid, with an empty panel and new-request link', async () => {
    listRequests.mockResolvedValue({ ok: true, data: [request(1)] });
    const c = await mount();
    expect(c.querySelector('.portal-req-page.portal-req-page--list .portal-req-rail')).not.toBeNull();
    expect(c.querySelector('.portal-req-page--request')).toBeNull();
    const panel = c.querySelector('.portal-req-empty');
    expect(panel.textContent).toContain('Pick a request, or start a new one');
    const link = panel.querySelector('a');
    expect(link.textContent).toBe('+ New request');
    expect(link.getAttribute('href')).toBe('/client-request/new');
  });

  it('renders main wide and a dashed strip link to a new request in the empty panel', async () => {
    listRequests.mockResolvedValue({ ok: true, data: [request(1)] });
    const c = await mount();
    expect(c.querySelector('main').classList.contains('portal--wide')).toBe(true);
    const strip = c.querySelector('.portal-req-empty a.portal-req-strip');
    expect(strip.textContent).toBe('Drop drawings to start a new request');
    expect(strip.getAttribute('href')).toBe('/client-request/new');
  });

  it('shows no empty panel when there are no requests', async () => {
    listRequests.mockResolvedValue({ ok: true, data: [] });
    const c = await mount();
    expect(c.querySelector('.portal-req-empty')).toBeNull();
    expect(c.querySelector('.portal-message').textContent).toContain('Start a Quick New Parts List');
  });

  it('renders no price even when the data has one', async () => {
    listRequests.mockResolvedValue({ ok: true, data: [request(1)] });
    const c = await mount();
    expect(c.textContent).not.toMatch(/price|\$|99/i);
  });
});
