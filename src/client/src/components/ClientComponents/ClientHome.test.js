import React, { act } from 'react';
import { render } from '../../testUtils/render';
import ClientHome from './ClientHome';

global.IS_REACT_ACT_ENVIRONMENT = true;

const job = (id, over = {}) => ({
  id,
  job_number: `J-${id}`,
  status: 'open',
  po_number: `PO-${id}`,
  po_date: '2024-01-02',
  due_date: '2024-03-05T00:00:00.000Z',
  ship_date: null,
  parts: [{ job_part_id: 1 }],
  ...over,
});

const page = (jobs, hasMore = false) => ({
  ok: true,
  status: 200,
  headers: { get: () => null },
  json: async () => ({ jobs, pagination: { total: jobs.length, limit: 20, offset: 0, hasMore } }),
});
const failure = (status) => ({ ok: false, status, headers: { get: () => null }, json: async () => ({}) });

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

let view;
const mount = async () => {
  view = render(<ClientHome />);
  await flush();
  return view.container;
};

beforeEach(() => { global.fetch = jest.fn(); });
afterEach(() => view && view.unmount());

describe('ClientHome', () => {
  it('shows number, badge, PO, dates and part count for each job', async () => {
    global.fetch.mockResolvedValueOnce(page([
      job(1, { parts: [{}, {}] }),
      job(2, { status: 'shipped', ship_date: '2024-04-09T00:00:00.000Z', parts: [{}] }),
    ]));
    const c = await mount();
    expect(global.fetch.mock.calls[0][0]).toMatch(/\/portal\/jobs\?limit=20&offset=0$/);
    const cards = c.querySelectorAll('.portal-card');
    expect(cards).toHaveLength(2);
    const [a, b] = [...cards].map((x) => x.textContent);
    expect(a).toContain('J-1');
    expect(a).toContain('Open');
    expect(a).toContain('PO-1');
    expect(a).toContain('3/5/2024');
    expect(a).toContain('2 parts');
    expect(cards[0].querySelector('.portal-badge--shipped')).toBeNull();
    expect(a).not.toContain('Shipped');
    expect(b).toContain('Shipped');
    expect(b).toContain('4/9/2024');
    expect(b).toContain('1 part');
    expect(b).not.toContain('1 parts');
    expect(cards[1].querySelector('.portal-badge--shipped').textContent).toBe('Shipped');
  });

  it('shows a dash when the ship date is empty', async () => {
    global.fetch.mockResolvedValueOnce(page([job(1)]));
    const c = await mount();
    expect(c.querySelector('.portal-card').textContent).toMatch(/Ship[^\d]*—/);
  });

  it('links each card to /client-job/:id', async () => {
    global.fetch.mockResolvedValueOnce(page([job(7), job(9)]));
    const c = await mount();
    const hrefs = [...c.querySelectorAll('.portal-card')].map((x) => x.getAttribute('href'));
    expect(hrefs).toEqual(['/client-job/7', '/client-job/9']);
  });

  it('Load more requests the next offset, appends jobs and hides when done', async () => {
    global.fetch
      .mockResolvedValueOnce(page([job(1)], true))
      .mockResolvedValueOnce(page([job(2)], false));
    const c = await mount();
    const button = () => [...c.querySelectorAll('button.portal-button')].find((b) => b.textContent === 'Load more');
    expect(button()).toBeDefined();
    await act(async () => { button().click(); });
    await flush();
    expect(global.fetch.mock.calls[1][0]).toMatch(/limit=20&offset=20$/);
    expect(c.querySelectorAll('.portal-card')).toHaveLength(2);
    expect(button()).toBeUndefined();
  });

  it('hides Load more when hasMore is false', async () => {
    global.fetch.mockResolvedValueOnce(page([job(1)], false));
    const c = await mount();
    expect(c.textContent).not.toContain('Load more');
  });

  it('shows the empty state for zero jobs', async () => {
    global.fetch.mockResolvedValueOnce(page([]));
    const c = await mount();
    const messages = c.querySelectorAll('.portal-message');
    expect(messages).toHaveLength(1);
    expect(messages[0].textContent).toContain("You don't have any jobs with us yet.");
    expect(c.querySelectorAll('.portal-card')).toHaveLength(0);
  });

  it('shows the signed_out message on 401', async () => {
    global.fetch.mockResolvedValueOnce(failure(401));
    const c = await mount();
    expect(c.textContent).toContain('You are signed out');
  });

  it('shows the busy message on 429', async () => {
    global.fetch.mockResolvedValueOnce(failure(429));
    const c = await mount();
    expect(c.textContent).toContain('We are a little busy');
  });

  it('shows a loading message before the first page arrives', async () => {
    global.fetch.mockReturnValueOnce(new Promise(() => {}));
    const c = await mount();
    expect(c.textContent).toContain('Loading');
  });
});
