import React, { act } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
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
    parts: [
      { part_id: 3, part_number: 'P-3', part_description: 'Bracket', jobs: [{ id: 7, job_number: 'J-7' }], drawings: [{ id: 1, filename: 'p3.pdf' }] },
      { part_id: 4, part_number: 'P-4', part_description: 'Plate', jobs: [], drawings: [{ id: 2, filename: 'p4a.pdf' }, { id: 3, filename: 'p4b.pdf' }] },
      { part_id: 5, part_number: 'P-5', part_description: 'Gear', jobs: [], drawings: [] },
    ],
    lists: [{ id: 1, name: 'Brackets', part_ids: [5] }],
    ...over,
  },
});
const schedule = {
  ok: true,
  data: { window: { start: '2026-10-26', end: '2026-11-22' }, timeline: [], board: [] },
};
const ticker = { ok: true, data: [] };
const failure = { ok: false, error: { kind: 'error', message: 'Boom happened' } };

const flush = () => act(async () => { for (let i = 0; i < 10; i += 1) await Promise.resolve(); });

function Where() {
  return <output data-testid="where">{useLocation().pathname}</output>;
}
const where = (c) => c.querySelector('[data-testid="where"]').textContent;

let view;
const mount = async () => {
  view = render(
    <Routes>
      <Route path="/client-overview" element={<ClientOverview />} />
      <Route path="/client-part/:id" element={<Where />} />
    </Routes>,
    { path: '/client-overview' },
  );
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

  it('renders the left column, headline, schedule and parts grid as panels and leaves a right column', async () => {
    const c = await mount();
    const panels = c.querySelectorAll('.portal-overview .portal-overview-panel');
    expect(panels).toHaveLength(4);
    expect(c.querySelector('.portal-overview-left').classList.contains('portal-overview-panel')).toBe(true);
    expect(c.querySelector('.portal-overview-headline').classList.contains('portal-overview-panel')).toBe(true);
    expect(c.querySelector('.portal-overview-parts').classList.contains('portal-overview-panel')).toBe(true);
    expect(c.querySelector('.portal-overview-panel .portal-sched')).not.toBeNull();
    expect(c.querySelector('.portal-overview-right')).not.toBeNull();
  });

  it('uses the plain light shell', async () => {
    const c = await mount();
    expect(c.querySelector('.portal-shell').className).toBe('portal-shell');
  });

  it('shows one tile per part with its first drawing and part number, without stage or quantity', async () => {
    const c = await mount();
    const tiles = c.querySelectorAll('.portal-parts-tile');
    expect(tiles).toHaveLength(3);
    expect(tiles[0].querySelector('.fake-tile').textContent).toBe('p3.pdf');
    expect(tiles[0].textContent).toContain('P-3');
    expect(tiles[0].textContent).not.toMatch(/Machining|J-7/);
    expect(tiles[1].querySelector('.fake-tile').textContent).toBe('p4a.pdf');
    expect(tiles[2].querySelector('.fake-tile').textContent).toBe('none');
  });

  it('heads the grid Parts with the count', async () => {
    const c = await mount();
    const grid = c.querySelector('.portal-overview-parts');
    expect(grid.querySelector('h2').textContent).toBe('Parts');
    expect(grid.textContent).toContain('3');
  });

  it('navigates to the part page when a tile is clicked', async () => {
    const c = await mount();
    act(() => { c.querySelectorAll('.portal-parts-tile .fake-tile')[1].click(); });
    expect(where(c)).toBe('/client-part/4');
  });

  it('puts the selected list parts first in list order, then restores order on a second click', async () => {
    const c = await mount();
    const order = () => [...c.querySelectorAll('.portal-parts-tile')].map((t) => t.textContent.match(/P-\d/)[0]);
    const list = () => c.querySelector('button.portal-overview-list');
    expect(order()).toEqual(['P-3', 'P-4', 'P-5']);
    act(() => { list().click(); });
    expect(list().getAttribute('aria-pressed')).toBe('true');
    expect(order()).toEqual(['P-5', 'P-3', 'P-4']);
    act(() => { list().click(); });
    expect(list().getAttribute('aria-pressed')).toBe('false');
    expect(order()).toEqual(['P-3', 'P-4', 'P-5']);
  });

  it('reloads the overview after a list is created', async () => {
    createList.mockResolvedValue({ ok: true, data: { id: 2, name: 'Gears', part_ids: [] } });
    const c = await mount();
    act(() => { [...c.querySelectorAll('button')].find((b) => b.textContent === '+ New list').click(); });
    const input = c.querySelector('input[aria-label="New list name"]');
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'Gears');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => { [...c.querySelectorAll('button')].find((b) => b.textContent === 'Create').click(); });
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

  describe('refresh', () => {
    const REFRESH_MS = 60000;
    const tick = (ms) => act(async () => { jest.advanceTimersByTime(ms); for (let i = 0; i < 10; i += 1) await Promise.resolve(); });
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('refetches overview, schedule and ticker every 60 seconds', async () => {
      await mount();
      await tick(REFRESH_MS - 1);
      expect(getOverview).toHaveBeenCalledTimes(1);
      await tick(1);
      [getOverview, getSchedule, getTicker].forEach((fn) => expect(fn).toHaveBeenCalledTimes(2));
      await tick(REFRESH_MS);
      [getOverview, getSchedule, getTicker].forEach((fn) => expect(fn).toHaveBeenCalledTimes(3));
    });

    it('stops refreshing after unmount', async () => {
      await mount();
      view.unmount();
      await tick(REFRESH_MS * 3);
      expect(getOverview).toHaveBeenCalledTimes(1);
      view = render(<div />, { path: '/' });
    });

    it('shows the Live synced indicator in the bottom bar, not the top bar, after a successful load', async () => {
      const c = await mount();
      const live = c.querySelector('.portal-overview-bottom .portal-live');
      expect(live.textContent).toContain('Live \u00b7 synced');
      expect(c.querySelector('.portal-topbar .portal-live')).toBeNull();
    });

    it('shows no indicator when the first load fails', async () => {
      getOverview.mockResolvedValue(failure);
      const c = await mount();
      expect(c.querySelector('.portal-live')).toBeNull();
    });

    it('keeps the last data on screen when a refresh fails', async () => {
      getTicker.mockResolvedValue({ ok: true, data: [{ at: '2026-10-29T10:00:00', job_number: 'J-7', own: false, stage }] });
      const c = await mount();
      getOverview.mockResolvedValue(failure);
      getSchedule.mockResolvedValue(failure);
      getTicker.mockResolvedValue(failure);
      await tick(REFRESH_MS);
      expect(getOverview).toHaveBeenCalledTimes(2);
      expect(c.querySelector('[role="alert"]')).toBeNull();
      expect(c.querySelector('.portal-overview-headline')).not.toBeNull();
      expect(c.querySelector('.portal-sched')).not.toBeNull();
      expect(c.querySelector('.portal-ticker').textContent).toContain('J-7');
    });

    it('shows new data after a successful refresh', async () => {
      const c = await mount();
      getOverview.mockResolvedValue(overview({ headline: { active_jobs: 42, due_soon: 0, overdue: 0, on_time_rate: null, parts_in_shop: 0, next_due: null, shipped_on_time: 0, shipped_total: 0 } }));
      await tick(REFRESH_MS);
      expect(c.querySelector('.portal-overview-headline').textContent).toContain('42');
    });
  });
});
