import React, { act } from 'react';
import { render } from '../../testUtils/render';
import ClientOverview from './ClientOverview';
import { getOverview, getSchedule, getTicker, formatDate } from '../../api/portalApi';
import { listNotes } from '../../api/portalNotesApi';
import { createList } from '../../api/portalListsApi';

jest.mock('../../api/portalApi', () => ({
  ...jest.requireActual('../../api/portalApi'),
  getOverview: jest.fn(),
  getSchedule: jest.fn(),
  getTicker: jest.fn(),
}));
jest.mock('../../api/portalListsApi', () => ({ createList: jest.fn(), renameList: jest.fn(), deleteList: jest.fn() }));
jest.mock('../../api/portalNotesApi', () => ({ listNotes: jest.fn(), addNote: jest.fn() }));
jest.mock('./DrawingTile', () => ({ file, onOpen }) => (
  <button type="button" className="fake-tile" onClick={() => onOpen(file)}>{file ? file.filename : 'none'}</button>
));

global.IS_REACT_ACT_ENVIRONMENT = true;

const stage = { key: 'machining', label: 'Machining' };
const overview = (over = {}) => ({
  ok: true,
  data: {
    headline: { active_jobs: 4, due_soon: 2, overdue: 1, on_time_rate: 87, parts_in_shop: 9, next_due: null, shipped_on_time: 7, shipped_total: 8 },
    jobs: [{ id: 7, job_number: 'J-7', po_number: 'PO-7', due_date: '2026-11-01', stage, flag: null, parts: [{ job_part_id: 1, stage }] }],
    requests: [{ id: 5, name: 'Bracket quote', status: 'sent', need_by: '2026-12-02' }],
    wall: [{ job_part_id: 11, part_id: 3, part_number: 'P-3', rev: 'A', job_id: 7, job_number: 'J-7', stage, drawing: { id: 1, filename: 'p3.pdf' } }],
    parts: [{ part_id: 3, part_number: 'P-3', part_description: 'Bracket', jobs: [{ id: 7, job_number: 'J-7' }], drawings: [{ id: 1, filename: 'p3.pdf' }] }],
    lists: [{ id: 1, name: 'Brackets', part_ids: [3] }],
    ...over,
  },
});
const schedule = {
  ok: true,
  data: { window: { start: '2026-10-26', end: '2026-11-22' }, timeline: [], board: [] },
};
const ticker = { ok: true, data: [] };
const failure = { ok: false, error: { kind: 'error', message: 'Boom happened' } };

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

let view;
const mount = async () => {
  view = render(<ClientOverview />, { path: '/client-overview' });
  await flush();
  return view.container;
};
const setPhone = (matches) => {
  window.matchMedia = jest.fn(() => ({ matches }));
};

beforeEach(() => {
  setPhone(false);
  getOverview.mockResolvedValue(overview());
  getSchedule.mockResolvedValue(schedule);
  getTicker.mockResolvedValue(ticker);
  listNotes.mockResolvedValue({ ok: true, data: { jobs: {}, parts: {} } });
});
afterEach(() => {
  view.unmount();
  delete window.matchMedia;
  jest.clearAllMocks();
});

describe('ClientOverview', () => {
  it('shows the Overview title with Overview marked current', async () => {
    const c = await mount();
    expect(c.querySelector('.portal-shell h1').textContent).toBe('Overview');
    expect(c.querySelector('.portal-shell h1').className).toBe('portal-visually-hidden');
    expect(c.querySelector('main').className).toBe('portal portal--wide');
    expect(c.querySelector('nav[aria-label="Portal"] a[aria-current="page"]').textContent).toBe('Overview');
  });

  it('loads all four calls and shows headline, job row, request, schedule and ticker', async () => {
    const c = await mount();
    [getOverview, getSchedule, getTicker, listNotes].forEach((fn) => expect(fn).toHaveBeenCalledTimes(1));
    const band = c.querySelector('.portal-overview-headline').textContent;
    expect(band).toContain('4');
    expect(band).toContain('87%');
    expect(c.querySelector('a[href="/client-job/7"]').textContent).toContain('J-7');
    const request = c.querySelector('a[href="/client-request/5"]');
    expect(request.textContent).toContain('Bracket quote');
    expect(request.textContent).toContain('Sent');
    expect(c.querySelector('a[href="/client-request/new"]')).not.toBeNull();
    expect(c.querySelector('.portal-sched')).not.toBeNull();
    expect(c.querySelector('.portal-ticker')).not.toBeNull();
  });

  it('always shows four headline cards with an on-time fraction and next due sub-line', async () => {
    getOverview.mockResolvedValue(overview({ headline: { active_jobs: 4, due_soon: 2, overdue: 1, on_time_rate: 87, parts_in_shop: 9, next_due: '2026-11-01', shipped_on_time: 7, shipped_total: 8 } }));
    const c = await mount();
    const cards = [...c.querySelectorAll('.portal-overview-headline .portal-overview-stat')];
    expect(cards.map((card) => card.querySelector('span').textContent)).toEqual(['Active jobs', 'Due soon', 'Overdue', 'On time']);
    expect(cards[1].textContent).toContain(formatDate('2026-11-01'));
    expect(cards[3].textContent).toContain('87%');
    expect(cards[3].textContent).toContain('7 of 8 shipped');
  });

  it('shows a dash and no shipped jobs yet in the On time card when the rate is null', async () => {
    getOverview.mockResolvedValue(overview({ headline: { active_jobs: 1, due_soon: 0, overdue: 0, on_time_rate: null, parts_in_shop: 0, next_due: null, shipped_on_time: 0, shipped_total: 0 } }));
    const c = await mount();
    const cards = c.querySelectorAll('.portal-overview-headline .portal-overview-stat');
    expect(cards).toHaveLength(4);
    expect(cards[3].querySelector('b').textContent).toBe('\u2014');
    expect(cards[3].textContent).toContain('no shipped jobs yet');
    expect(c.querySelector('.portal-overview-headline').textContent).not.toMatch(/%|null/);
  });

  it('renders the left column, headline, schedule and wall as panels and leaves a right column', async () => {
    const c = await mount();
    const panels = c.querySelectorAll('.portal-overview .portal-overview-panel');
    expect(panels).toHaveLength(4);
    expect(c.querySelector('.portal-overview-left').classList.contains('portal-overview-panel')).toBe(true);
    expect(c.querySelector('.portal-overview-headline').classList.contains('portal-overview-panel')).toBe(true);
    expect(c.querySelector('.portal-overview-wall').classList.contains('portal-overview-panel')).toBe(true);
    expect(c.querySelector('.portal-overview-panel .portal-sched')).not.toBeNull();
    expect(c.querySelector('.portal-overview-right')).not.toBeNull();
  });

  it('uses the dark shell', async () => {
    const c = await mount();
    expect(c.querySelector('.portal-shell').classList.contains('portal-shell--dark')).toBe(true);
  });

  it('shows a wall tile with its stage badge and job number', async () => {
    const c = await mount();
    const tile = c.querySelector('.portal-wall-tile');
    expect(tile.textContent).toContain('J-7');
    expect(tile.textContent).toContain('Machining');
    expect(tile.textContent).toContain('p3.pdf');
  });

  it('opens a wall tile in the drawing windows when clicked', async () => {
    const c = await mount();
    expect(c.querySelector('.portal-window')).toBeNull();
    act(() => { c.querySelector('.portal-wall-tile .fake-tile').click(); });
    expect(c.querySelector('.portal-window .portal-window-head').textContent).toContain('P-3');
  });

  it('opens a rail part row in the drawing windows', async () => {
    const c = await mount();
    expect(c.querySelector('.portal-overview-right [role="tab"]').textContent).toBe('Parts 1');
    act(() => { c.querySelector('.portal-overview-right .portal-overview-part').click(); });
    const head = c.querySelector('.portal-window .portal-window-head').textContent;
    expect(head).toContain('P-3');
  });

  it('reloads the overview after a list is created', async () => {
    createList.mockResolvedValue({ ok: true, data: { id: 2, name: 'Gears', part_ids: [] } });
    const c = await mount();
    act(() => { [...c.querySelectorAll('[role="tab"]')].find((t) => t.textContent.startsWith('Lists')).click(); });
    const input = c.querySelector('input[aria-label="New list name"]');
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'Gears');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => { [...c.querySelectorAll('button')].find((b) => b.textContent === 'New list').click(); });
    await flush();
    expect(createList).toHaveBeenCalledWith('Gears');
    expect(getOverview).toHaveBeenCalledTimes(2);
  });

  it('hides only the schedule panel when the schedule call fails', async () => {
    getSchedule.mockResolvedValue(failure);
    const c = await mount();
    expect(c.querySelector('.portal-sched')).toBeNull();
    expect(c.querySelector('.portal-ticker')).not.toBeNull();
    expect(c.querySelector('.portal-overview-headline')).not.toBeNull();
  });

  it('still shows the ticker bar with fallback text when the ticker call fails', async () => {
    getTicker.mockResolvedValue(failure);
    const c = await mount();
    expect(c.querySelector('.portal-ticker').textContent).toContain('No shop moves yet today');
    expect(c.querySelector('.portal-overview-headline')).not.toBeNull();
    expect(c.querySelector('.portal-sched')).not.toBeNull();
  });

  it('shows the error message when the overview call fails', async () => {
    getOverview.mockResolvedValue(failure);
    const c = await mount();
    expect(c.querySelector('[role="alert"]').textContent).toContain('Boom happened');
    expect(c.querySelector('.portal-overview-headline')).toBeNull();
  });

  it('navigates to /client-home under 600px wide', async () => {
    setPhone(true);
    const c = await mount();
    expect(window.matchMedia).toHaveBeenCalledWith('(max-width: 599px)');
    expect(c.querySelector('.portal-overview-headline')).toBeNull();
    expect(getOverview).not.toHaveBeenCalled();
  });

  it('heads the wall panel with Live from the shop floor and the part count and captions part numbers', async () => {
    const c = await mount();
    const wall = c.querySelector('.portal-overview-wall');
    expect(wall.querySelector('h2').textContent).toBe('Live from the shop floor');
    expect(wall.textContent).toContain('All 1 parts');
    expect(wall.querySelector('.portal-wall-caption').textContent).toContain('P-3');
  });

  it('shows the empty message when nothing is on the wall', async () => {
    getOverview.mockResolvedValue(overview({ wall: [] }));
    const c = await mount();
    expect(c.querySelector('.portal-overview-wall').textContent).toContain('Nothing on the machines for you right now');
  });

  it('shows each request as REQ id, name, sent and line count sub-line, need by and a status class', async () => {
    getOverview.mockResolvedValue(overview({ requests: [{ id: 5, name: 'Bracket quote', status: 'sent', need_by: '2026-12-02', submitted_at: '2026-10-20', line_count: 3 }] }));
    const c = await mount();
    const row = c.querySelector('a[href="/client-request/5"]');
    expect(row.textContent).toContain('REQ-5');
    expect(row.textContent).toContain('Bracket quote');
    expect(row.textContent).toContain(`Sent ${formatDate('2026-10-20')} \u00b7 3 lines`);
    expect(row.textContent).toContain(`Need by ${formatDate('2026-12-02')}`);
    expect(row.querySelector('.portal-overview-status--sent')).not.toBeNull();
  });

  it('puts New request as a link in the requests header, not a button', async () => {
    const c = await mount();
    const link = c.querySelector('.portal-overview-requests header a[href="/client-request/new"]');
    expect(link.textContent).toBe('New request');
    expect(link.classList.contains('portal-button')).toBe(false);
    expect(c.querySelector('.portal-overview-requests header h2').textContent).toBe('Requests');
  });
});
