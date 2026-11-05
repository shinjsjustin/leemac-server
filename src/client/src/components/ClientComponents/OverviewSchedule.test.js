import fs from 'fs';
import path from 'path';
import React, { act } from 'react';
import { render } from '../../testUtils/render';
import OverviewSchedule from './OverviewSchedule';

global.IS_REACT_ACT_ENVIRONMENT = true;

const MACH = { key: 'machining', label: 'Machining' };
const INSP = { key: 'inspection', label: 'Inspection' };

// Window is 28 days: Mon 2026-10-26 .. Sun 2026-11-22.
const schedule = {
  window: { start: '2026-10-26', end: '2026-11-22' },
  board: [
    { id: 11, job_number: 'J-11', stage: MACH, part_count: 3, flag: 'due_soon', own: true, created_at: '2026-10-28T14:00:00Z', due_date: '2026-11-03' },
    { job_number: 'X-99', stage: MACH, part_count: 5, created_at: '2026-10-01', due_date: '2026-12-31' },
    { job_number: 'X-98', stage: INSP, part_count: 1, created_at: '2026-11-10', due_date: null },
    { job_number: 'X-97', stage: INSP, part_count: 2, created_at: '2026-09-01', due_date: '2026-10-20' },
    { job_number: 'X-96', stage: INSP, part_count: 2, created_at: '2026-11-25', due_date: '2026-12-01' },
  ],
};

let view;
afterEach(() => view && view.unmount());
const mount = (over = {}) => {
  view = render(<OverviewSchedule schedule={schedule} now="2026-11-02" {...over} />);
  return view.container;
};
const pct = (el, prop) => parseFloat(el.style[prop]);

const rowOf = (c, job) => [...c.querySelectorAll('.portal-board-row')].find((r) => r.textContent.includes(job));

describe('OverviewSchedule bars', () => {
  it('places a bar from created_at to due_date inclusive', () => {
    const bar = rowOf(mount(), 'J-11').querySelector('.portal-sched-bar');
    // created day 2 of 28, through due day 8 => 7 days wide
    expect(pct(bar, 'left')).toBeCloseTo((2 / 28) * 100, 4);
    expect(pct(bar, 'width')).toBeCloseTo((7 / 28) * 100, 4);
    expect(bar.className).not.toContain('--open');
    expect(bar.className).toContain('portal-sched-bar--machining');
  });

  it('clamps bars that start before or end after the window', () => {
    const bar = rowOf(mount(), 'X-99').querySelector('.portal-sched-bar');
    expect(pct(bar, 'left')).toBeCloseTo(0, 4);
    expect(pct(bar, 'width')).toBeCloseTo(100, 4);
  });

  it('runs an open bar from the start to the window end when there is no due date', () => {
    const bar = rowOf(mount(), 'X-98').querySelector('.portal-sched-bar');
    // created day 15 => 13 days to the right edge
    expect(pct(bar, 'left')).toBeCloseTo((15 / 28) * 100, 4);
    expect(pct(bar, 'width')).toBeCloseTo((13 / 28) * 100, 4);
    expect(bar.className).toContain('portal-sched-bar--open');
    expect(bar.className).toContain('portal-sched-bar--inspection');
  });

  it('draws no bar for entries that end before or start after the window', () => {
    const c = mount();
    expect(rowOf(c, 'X-97')).toBeTruthy();
    expect(rowOf(c, 'X-97').querySelector('.portal-sched-bar')).toBeNull();
    expect(rowOf(c, 'X-96')).toBeTruthy();
    expect(rowOf(c, 'X-96').querySelector('.portal-sched-bar')).toBeNull();
  });

  it('no longer renders separate timeline rows or ship ticks', () => {
    const c = mount();
    expect(c.querySelector('.portal-sched-ship')).toBeNull();
    expect(c.querySelector('.portal-sched-row')).toBeNull();
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
    expect(title.textContent).toBe('Schedule 26 Oct \u2013 22 Nov \u00b7 bar = created to due');
  });

  describe('day header with a mid-week window start', () => {
    // Wed 2026-10-21 .. Tue 2026-11-17
    const midWeek = { window: { start: '2026-10-21', end: '2026-11-17' }, board: [] };
    const cells = () => [...mount({ schedule: midWeek }).querySelectorAll('.portal-sched-day')];

    it('keeps 28 cells and labels only the first day and each Monday', () => {
      const texts = cells().map((t) => t.textContent);
      expect(texts).toHaveLength(28);
      const labelled = texts.map((t, i) => [i, t]).filter(([, t]) => t !== '');
      expect(labelled).toEqual([[0, '21 Oct'], [5, '26 Oct'], [12, '2 Nov'], [19, '9 Nov'], [26, '16 Nov']]);
    });

    it('never runs a weekday letter into a date', () => {
      cells().forEach((t) => expect(t.textContent).not.toMatch(/^[SMTWF] \d/));
    });
  });
});

describe('OverviewSchedule board', () => {
  it('lists every entry with job number, stage label and part count', () => {
    const rows = mount().querySelectorAll('.portal-board-row');
    expect(rows).toHaveLength(5);
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

describe('schedule day header CSS', () => {
  it('hides overflow so labels stay inside the panel', () => {
    const css = fs.readFileSync(path.join(__dirname, '../Styling/PortalOverview.css'), 'utf8');
    const body = /\.portal-sched-days\s*\{([^}]*)\}/.exec(css)[1];
    expect(body).toMatch(/overflow:\s*hidden/);
  });
});

describe('OverviewSchedule onJobClick', () => {
  const withUndated = { ...schedule, undated: [{ id: 12, job_number: 'U-12', stage: INSP }] };
  const click = (el, init = {}) => {
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, ...init });
    act(() => { el.dispatchEvent(event); });
    return event;
  };

  it('calls onJobClick with the job id and the event from a board row and an undated row', () => {
    const onJobClick = jest.fn();
    const c = mount({ schedule: withUndated, onJobClick, jobPath: (id) => `/job/${id}` });
    click(rowOf(c, 'J-11'));
    click(rowOf(c, 'U-12'));
    expect(onJobClick.mock.calls.map(([id]) => id)).toEqual([11, 12]);
    expect(onJobClick.mock.calls[0][1].type).toBe('click');
  });

  it('keeps every row href when onJobClick is passed', () => {
    const c = mount({ schedule: withUndated, onJobClick: jest.fn(), jobPath: (id) => `/job/${id}` });
    expect(rowOf(c, 'J-11').getAttribute('href')).toBe('/job/11');
    expect(rowOf(c, 'U-12').getAttribute('href')).toBe('/job/12');
  });

  it('links exactly as before when onJobClick is absent', () => {
    const c = mount({ schedule: withUndated });
    expect(rowOf(c, 'J-11').getAttribute('href')).toBe('/client-job/11');
  });
});
