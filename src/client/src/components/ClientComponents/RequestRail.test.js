import React, { act } from 'react';
import { render } from '../../testUtils/render';
import RequestRail, { requestCode } from './RequestRail';
import { formatDate } from '../../api/portalApi';

global.IS_REACT_ACT_ENVIRONMENT = true;

const requests = [
  { id: 7, name: 'Brackets', status: 'draft', need_by: '2026-11-05', updated_at: '2026-10-20T14:00:00.000Z', job_id: null },
  { id: 12, name: '', status: 'sent', need_by: null, updated_at: '2026-10-21T14:00:00.000Z', job_id: 55 },
  { id: 13, name: 'Gears', status: 'sent', need_by: null, updated_at: '2026-10-21T14:00:00.000Z', job_id: null },
];
const lists = [
  { id: 1, name: 'Brackets', part_ids: [1, 2, 3] },
  { id: 2, name: 'Gears', part_ids: [4] },
];

let view;
const mount = (props) => {
  view = render(<RequestRail requests={requests} lists={lists} {...props} />);
  return view.container;
};
afterEach(() => {
  jest.useRealTimers();
  if (view) view.unmount();
});

describe('requestCode', () => {
  it.each([[2, 'REQ-0002'], [12, 'REQ-0012'], [12345, 'REQ-12345']])('formats %s as %s', (id, code) => {
    expect(requestCode(id)).toBe(code);
  });
});

describe('RequestRail', () => {
  it('links + New request and shows the request count', () => {
    const c = mount();
    const link = [...c.querySelectorAll('a')].find((a) => a.textContent === '+ New request');
    expect(link.getAttribute('href')).toBe('/client-request/new');
    expect(c.textContent).toContain('Your requests');
    expect(c.querySelector('.portal-req-count').textContent).toBe('3');
  });

  it('shows one text row per request with padded id, status, name and meta', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-22T12:00:00Z'));
    const c = mount();
    const rows = c.querySelectorAll('a.portal-req-row');
    expect(rows).toHaveLength(3);
    expect(rows[0].getAttribute('href')).toBe('/client-request/7');
    expect(rows[0].querySelector('.portal-req-id').textContent).toBe('REQ-0007');
    expect(rows[0].textContent).toContain('Draft');
    expect(rows[0].textContent).toContain('Brackets');
    expect(rows[0].textContent).toContain('Updated 2d ago');
    expect(rows[0].textContent).toContain(`Need by ${formatDate('2026-11-05')}`);
    expect(rows[1].textContent).toContain('Request #12');
    expect(rows[1].textContent).not.toContain('Need by');
    expect(rows[0].querySelector('img, svg, canvas')).toBeNull();
  });

  it('does not give rail rows the request grid row class', () => {
    const rows = mount().querySelectorAll('a.portal-req-row');
    expect(rows).toHaveLength(3);
    rows.forEach((row) => expect(row.classList.contains('portal-request-row')).toBe(false));
  });

  it('marks only the current request and shows Job created for a sent request with a job', () => {
    const c = mount({ currentId: 12 });
    const rows = c.querySelectorAll('a.portal-req-row');
    expect(rows[1].classList.contains('portal-req-row--current')).toBe(true);
    expect(rows[1].getAttribute('aria-current')).toBe('page');
    expect(rows[1].textContent).toContain('Job created');
    expect(rows[2].textContent).toContain('Sent');
    expect(rows[2].textContent).not.toContain('Job created');
    expect(rows[0].classList.contains('portal-req-row--current')).toBe(false);
    expect(rows[0].hasAttribute('aria-current')).toBe(false);
  });

  it('lists each list name and part count with a Request link to /client-parts', () => {
    const c = mount();
    expect(c.textContent).toContain('Start from a list');
    const items = c.querySelectorAll('.portal-req-list');
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain('Brackets');
    expect(items[0].textContent).toContain('3 parts');
    expect(items[1].textContent).toContain('1 part');
    expect(items[1].textContent).not.toContain('1 parts');
    const link = items[0].querySelector('a');
    expect(link.textContent).toBe('Request');
    expect(link.getAttribute('href')).toBe('/client-parts?request=1');
  });

  it('gives each row a status class and reads Job J-1 when job_number is set', () => {
    const c = mount({ requests: [
      { ...requests[0], line_count: 3, from_list: true },
      { ...requests[2], status: 'job_created', job_number: 'J-1', line_count: 1, from_list: false },
      { ...requests[2], id: 14, status: 'in_review', line_count: 2 },
    ] });
    const status = [...c.querySelectorAll('.portal-req-status')];
    expect(status[0].classList.contains('portal-req-status--draft')).toBe(true);
    expect(status[1].classList.contains('portal-req-status--job_created')).toBe(true);
    expect(status[1].textContent).toBe('Job J-1');
    expect(status[2].classList.contains('portal-req-status--in_review')).toBe(true);
    expect(status[2].textContent).not.toContain('Job');
  });

  it('reads N lines, 1 line, and from list before the updated date', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-22T12:00:00Z'));
    const c = mount({ requests: [
      { ...requests[0], line_count: 3, from_list: true },
      { ...requests[1], line_count: 1, from_list: false },
    ] });
    const meta = c.querySelectorAll('.portal-req-meta');
    expect(meta[0].textContent.startsWith('3 lines · from list · Updated 2d ago')).toBe(true);
    expect(meta[1].textContent.startsWith('1 line · Updated')).toBe(true);
    expect(meta[1].textContent).not.toContain('from list');
  });

  it('puts the name and Request link on a top line above the count line', () => {
    const item = mount().querySelectorAll('.portal-req-list')[0];
    const top = item.querySelector('.portal-req-list-top');
    expect(top.querySelector('.portal-req-name').textContent).toBe('Brackets');
    expect(top.querySelector('a').textContent).toBe('Request');
    const meta = item.querySelector('.portal-req-meta');
    expect(top.contains(meta)).toBe(false);
    expect(meta.textContent).toBe('3 parts');
    expect(top.compareDocumentPosition(meta) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(mount().querySelectorAll('.portal-req-list .portal-req-meta')[1].textContent).toBe('1 part');
  });

  it('links a list Request to its request id', () => {
    const link = mount().querySelectorAll('.portal-req-list')[1].querySelector('a');
    expect(link.getAttribute('href')).toBe('/client-parts?request=2');
  });

  it('hides the list section when there are no lists', () => {
    const c = mount({ lists: [] });
    expect(c.textContent).not.toContain('Start from a list');
  });
});
