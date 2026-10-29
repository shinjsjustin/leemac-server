import React, { act } from 'react';
import { render } from '../../testUtils/render';
import ClientRequestsPage from './ClientRequestsPage';
import { listRequests } from '../../api/portalRequestsApi';

jest.mock('../../api/portalRequestsApi', () => ({
  listRequests: jest.fn(),
  requestStatusLabel: jest.requireActual('../../api/portalRequestsApi').requestStatusLabel,
}));

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

beforeEach(() => listRequests.mockReset());
afterEach(() => view && view.unmount());

describe('ClientRequestsPage', () => {
  it('shows name or fallback, need-by, updated date and status label per request', async () => {
    listRequests.mockResolvedValue({ ok: true, data: [
      request(1),
      request(2, { name: '', need_by: null, status: 'in_review' }),
      request(3, { name: null, status: 'sent' }),
      request(4, { status: 'job_created' }),
    ] });
    const c = await mount();
    expect(c.querySelector('h1').textContent).toBe('Your requests');
    const rows = c.querySelectorAll('.portal-card');
    expect(rows).toHaveLength(4);
    expect(rows[0].textContent).toContain('Brackets 1');
    expect(rows[0].textContent).toContain('11/5/2026');
    expect(rows[0].textContent).toContain('10/20/2026');
    expect(rows[0].querySelector('.portal-badge').textContent).toBe('Draft');
    expect(rows[1].textContent).toContain('Request #2');
    expect(rows[1].querySelector('.portal-badge').textContent).toBe('In review');
    expect(rows[2].textContent).toContain('Request #3');
    expect(rows[2].querySelector('.portal-badge').textContent).toBe('Sent');
    expect(rows[3].querySelector('.portal-badge').textContent).toBe('Job created');
  });

  it('links each row to its request and offers a Quick New Parts List button', async () => {
    listRequests.mockResolvedValue({ ok: true, data: [request(7)] });
    const c = await mount();
    expect(c.querySelector('.portal-card').getAttribute('href')).toBe('/client-request/7');
    const button = [...c.querySelectorAll('a.portal-button')].find((a) => a.textContent === 'Quick New Parts List');
    expect(button.getAttribute('href')).toBe('/client-request/new');
  });

  it('shows loading, then the error kind and message on failure', async () => {
    let resolve;
    listRequests.mockReturnValue(new Promise((r) => { resolve = r; }));
    view = render(<ClientRequestsPage />);
    expect(view.container.querySelector('.portal-message h2').textContent).toBe('Loading');
    await act(async () => resolve({ ok: false, error: { kind: 'error', message: 'Boom' } }));
    const alert = view.container.querySelector('.portal-message[role="alert"]');
    expect(alert.textContent).toContain('Boom');
    expect(view.container.querySelector('.portal-card')).toBeNull();
  });

  it('shows the empty message inviting a first list', async () => {
    listRequests.mockResolvedValue({ ok: true, data: [] });
    const c = await mount();
    expect(c.querySelector('.portal-message').textContent).toContain('Start a Quick New Parts List');
  });

  it('renders no price even when the data has one', async () => {
    listRequests.mockResolvedValue({ ok: true, data: [request(1)] });
    const c = await mount();
    expect(c.textContent).not.toMatch(/price|\$|99/i);
  });
});
