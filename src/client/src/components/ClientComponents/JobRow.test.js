import React from 'react';
import { render } from '../../testUtils/render';
import JobRow from './JobRow';

global.IS_REACT_ACT_ENVIRONMENT = true;

const job = (over = {}) => ({
  id: 7,
  job_number: 'J-7',
  po_number: 'PO-7',
  due_date: '2024-03-05T00:00:00.000Z',
  stage: { key: 'machining', label: 'Machining' },
  flag: 'overdue',
  parts: [
    { job_part_id: 1, stage: { key: 'machining', label: 'Machining' } },
    { job_part_id: 2, stage: null },
    { job_part_id: 3, stage: { key: 'inspection', label: 'Inspection' } },
  ],
  ...over,
});

let view;
const mount = (props) => {
  view = render(<JobRow job={job()} notes={[]} {...props} />);
  return view.container;
};
afterEach(() => view && view.unmount());

describe('JobRow', () => {
  it('links to the job page and shows number, badge with flag and due date', () => {
    const c = mount();
    const link = c.querySelector('a.portal-job-row');
    expect(link.getAttribute('href')).toBe('/client-job/7');
    expect(link.querySelector('.portal-job-num').textContent).toBe('J-7');
    expect(link.querySelector('.portal-job-dot--machining').textContent).toBe('MachiningOverdue');
    expect(link.textContent).toContain('PO-7');
    expect(link.textContent).toContain('3/5/2024');
  });

  it('renders one bar segment per part classed by its stage key or none', () => {
    const c = mount();
    const segs = [...c.querySelectorAll('.portal-job-seg')].map((x) => x.className);
    expect(segs).toEqual([
      'portal-job-seg portal-job-seg--machining',
      'portal-job-seg portal-job-seg--none',
      'portal-job-seg portal-job-seg--inspection',
    ]);
  });

  it.each(['shipped', 'invoiced'])('fades a %s job', (key) => {
    const c = mount({ job: job({ stage: { key, label: key } }) });
    expect(c.querySelector('.portal-job-row--faded')).not.toBeNull();
  });

  it('does not fade an active job', () => {
    expect(mount().querySelector('.portal-job-row--faded')).toBeNull();
  });

  it('renders nothing for empty PO and due values', () => {
    const c = mount({ job: job({ po_number: '  ', due_date: null }) });
    const text = c.querySelector('a').textContent;
    expect(text).not.toContain('—');
    expect(text).not.toMatch(/PO|Due/);
  });

  it('compact rows show Due with the date, or no due date when empty', () => {
    expect(mount({ compact: true }).querySelector('.portal-job-due').textContent).toBe('Due 3/5/2024');
    view.unmount();
    expect(mount({ compact: true, job: job({ due_date: null }) }).querySelector('.portal-job-due').textContent).toBe('no due date');
  });

  it('marks the link aria-current page only when current', () => {
    expect(mount({ current: true }).querySelector('a.portal-job-row').getAttribute('aria-current')).toBe('page');
    view.unmount();
    expect(mount().querySelector('a.portal-job-row').hasAttribute('aria-current')).toBe(false);
  });

  it('wraps the row in a note target showing the note count', () => {
    const notes = [{ id: 1, content: 'Hi', author: 'Jo', is_client: true, created_at: '2026-10-01T00:00:00Z' }];
    const c = mount({ notes });
    expect(c.querySelector('.portal-pin-target a.portal-job-row')).not.toBeNull();
    expect(c.querySelector('.portal-pin').textContent).toBe('1');
  });

  it('compact rows show a stage dot with its label and the part count instead of a badge', () => {
    const c = mount({ compact: true, job: job({ flag: null }) });
    expect(c.querySelector('.portal-job-dot').textContent).toBe('Machining');
    expect(c.querySelector('.portal-stage')).toBeNull();
    expect(c.querySelector('a').textContent).toContain('3 parts');
  });

  it('compact overdue rows show the Overdue flag', () => {
    const c = mount({ compact: true });
    expect(c.querySelector('.portal-job-dot .portal-stage-flag--overdue').textContent).toBe('Overdue');
  });

  it('full rows show a stage dot with its flag, no badge and no part count', () => {
    const c = mount();
    expect(c.querySelector('.portal-job-dot .portal-stage-flag--overdue').textContent).toBe('Overdue');
    expect(c.querySelector('.portal-stage')).toBeNull();
    expect(c.querySelector('a').textContent).not.toContain('3 parts');
  });
});
