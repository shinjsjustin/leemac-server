import React from 'react';
import { render } from '../../testUtils/render';
import OverviewSchedule from './OverviewSchedule';

global.IS_REACT_ACT_ENVIRONMENT = true;

const MACH = { key: 'machining', label: 'Machining' };

const schedule = {
  window: { start: '2026-10-26', end: '2026-11-22' },
  board: [
    { id: 11, job_number: 'J-11', stage: MACH, part_count: 3, flag: 'due_soon', own: true, created_at: '2026-10-28', due_date: '2026-11-03', company_name: 'Acme Co' },
    { id: 12, job_number: 'J-12', stage: MACH, part_count: 1, flag: null, own: true, created_at: '2026-10-28', due_date: '2026-11-03' },
  ],
  undated: [
    { id: 21, job_number: 'J-21', stage: MACH, flag: null, company_name: 'Globex' },
    { id: 22, job_number: 'J-22', stage: MACH, flag: null },
  ],
};

let view;
afterEach(() => view && view.unmount());
const mount = (over = {}) => {
  view = render(<OverviewSchedule schedule={schedule} now="2026-11-02" {...over} />);
  return view.container;
};
const rowOf = (c, job) => [...c.querySelectorAll('.portal-board-row')].find((r) => r.textContent.includes(job));
const adminPath = (id) => `/job/${id}`;

describe('OverviewSchedule with jobPath', () => {
  it('links board and undated rows through jobPath', () => {
    const c = mount({ jobPath: adminPath });
    expect(rowOf(c, 'J-11').getAttribute('href')).toBe('/job/11');
    expect(rowOf(c, 'J-21').getAttribute('href')).toBe('/job/21');
  });

  it('links to /client-job/:id without jobPath', () => {
    const c = mount();
    expect(rowOf(c, 'J-11').getAttribute('href')).toBe('/client-job/11');
    expect(rowOf(c, 'J-21').getAttribute('href')).toBe('/client-job/21');
  });
});

describe('OverviewSchedule company_name', () => {
  it('shows the company name in board and undated rows that have one', () => {
    const c = mount();
    expect(rowOf(c, 'J-11').querySelector('.portal-board-client').textContent).toBe('Acme Co');
    expect(rowOf(c, 'J-21').querySelector('.portal-board-client').textContent).toBe('Globex');
  });

  it('renders no client span for entries without a company name', () => {
    const c = mount();
    expect(rowOf(c, 'J-12').querySelector('.portal-board-client')).toBeNull();
    expect(rowOf(c, 'J-22').querySelector('.portal-board-client')).toBeNull();
  });
});
