import React from 'react';
import { render } from '../../testUtils/render';
import OverviewSchedule from './OverviewSchedule';

global.IS_REACT_ACT_ENVIRONMENT = true;

const MACH = { key: 'machining', label: 'Machining' };
const INSP = { key: 'inspection', label: 'Inspection' };

// Window is 28 days: Mon 2026-10-26 .. Sun 2026-11-22.
const schedule = {
  window: { start: '2026-10-26', end: '2026-11-22' },
  timeline: [
    { id: 11, job_number: 'J-11', start: '2026-10-28', due_date: '2026-11-03', ship_date: '2026-11-04', stage: MACH, flag: 'due_soon' },
    { id: 12, job_number: 'J-12', start: '2026-10-01', due_date: '2026-12-31', ship_date: null, stage: INSP, flag: null },
  ],
  board: [
    { id: 11, job_number: 'J-11', stage: MACH, part_count: 3, flag: 'due_soon', own: true },
    { job_number: 'X-99', stage: MACH, part_count: 5 },
    { job_number: 'X-98', stage: INSP, part_count: 1 },
  ],
};

let view;
afterEach(() => view && view.unmount());
const mount = (over = {}) => {
  view = render(<OverviewSchedule schedule={schedule} now="2026-11-02" {...over} />);
  return view.container;
};
const pct = (el, prop) => parseFloat(el.style[prop]);

describe('OverviewSchedule timeline', () => {
  it('draws one bar per timeline job placed by start and due date', () => {
    const bars = mount().querySelectorAll('.portal-sched-bar');
    expect(bars).toHaveLength(2);
    // start day 2 of 28, through due day 8 => 7 days wide
    expect(pct(bars[0], 'left')).toBeCloseTo((2 / 28) * 100, 4);
    expect(pct(bars[0], 'width')).toBeCloseTo((7 / 28) * 100, 4);
    expect(bars[0].textContent).toContain('J-11');
  });

  it('clamps bars that start before or end after the window', () => {
    const bar = mount().querySelectorAll('.portal-sched-bar')[1];
    expect(pct(bar, 'left')).toBeCloseTo(0, 4);
    expect(pct(bar, 'width')).toBeCloseTo(100, 4);
  });

  it('puts a ship tick at ship_date only for jobs that have one', () => {
    const ticks = mount().querySelectorAll('.portal-sched-ship');
    expect(ticks).toHaveLength(1);
    expect(pct(ticks[0], 'left')).toBeCloseTo((9 / 28) * 100, 4);
  });

  it('puts the NOW line at today offset', () => {
    const now = mount().querySelector('.portal-sched-now');
    expect(pct(now, 'left')).toBeCloseTo((7 / 28) * 100, 4);
  });

  it('omits the NOW line when today is outside the window', () => {
    expect(mount({ now: '2026-12-25' }).querySelector('.portal-sched-now')).toBeNull();
  });

  it('titles the schedule with the window dates and the legend', () => {
    const title = mount().querySelector('.portal-sched-title');
    expect(title.textContent).toBe('Schedule 26 Oct \u2013 22 Nov \u00b7 bar = in the shop, white tick = ship date');
  });

  it('shows 28 day ticks with weekday letter and date', () => {
    const ticks = [...mount().querySelectorAll('.portal-sched-day')].map((t) => t.textContent);
    expect(ticks).toHaveLength(28);
    expect(ticks.slice(0, 7)).toEqual(['M 26', 'T 27', 'W 28', 'T 29', 'F 30', 'S 31', 'S 1']);
    expect(ticks[27]).toBe('S 22');
  });
});

describe('OverviewSchedule board', () => {
  it('lists every entry with job number, stage label and part count', () => {
    const rows = mount().querySelectorAll('.portal-board-row');
    expect(rows).toHaveLength(3);
    expect(rows[1].textContent).toContain('X-99');
    expect(rows[1].textContent).toContain('Machining');
    expect(rows[1].textContent).toContain('5 parts');
    expect(rows[2].textContent).toContain('1 part');
    expect(rows[2].textContent).not.toContain('1 parts');
  });

  it('links own rows to the job and shows their flag', () => {
    const own = mount().querySelector('a.portal-board-row');
    expect(own.getAttribute('href')).toBe('/client-job/11');
    expect(own.querySelector('.portal-stage-flag--due_soon')).not.toBeNull();
  });

  it('renders other clients rows as plain text with no link and no flag', () => {
    const c = mount();
    expect(c.querySelectorAll('a.portal-board-row')).toHaveLength(1);
    const other = c.querySelectorAll('.portal-board-row')[1];
    expect(other.tagName).toBe('DIV');
    expect(other.querySelector('a')).toBeNull();
    expect(other.querySelector('.portal-stage-flag')).toBeNull();
  });
});

describe('OverviewSchedule undated jobs', () => {
  const undated = [{ id: 21, job_number: 'J-21', stage: MACH, flag: null }];

  it('renders each undated job as a link row with number, stage and no due date', () => {
    const rows = mount({ schedule: { ...schedule, undated } }).querySelectorAll('a.portal-board-row');
    const row = [...rows].find((r) => r.textContent.includes('J-21'));
    expect(row.getAttribute('href')).toBe('/client-job/21');
    expect(row.textContent).toContain('Machining');
    expect(row.textContent).toContain('no due date');
  });

  it('renders no undated rows when the array is missing', () => {
    expect(mount().textContent).not.toContain('no due date');
  });
});
