import React, { act } from 'react';
import { render } from '../../testUtils/render';
import RequestRail from './RequestRail';

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
afterEach(() => view && view.unmount());

describe('RequestRail', () => {
  it('links + New request and shows the request count', () => {
    const c = mount();
    const link = [...c.querySelectorAll('a')].find((a) => a.textContent === '+ New request');
    expect(link.getAttribute('href')).toBe('/client-request/new');
    expect(c.textContent).toContain('Your requests');
    expect(c.querySelector('.portal-req-count').textContent).toBe('3');
  });

  it('shows one text row per request with padded id, status, name and meta', () => {
    const c = mount();
    const rows = c.querySelectorAll('a.portal-req-row');
    expect(rows).toHaveLength(3);
    expect(rows[0].getAttribute('href')).toBe('/client-request/7');
    expect(rows[0].querySelector('.portal-req-id').textContent).toBe('REQ-0007');
    expect(rows[0].textContent).toContain('Draft');
    expect(rows[0].textContent).toContain('Brackets');
    expect(rows[0].textContent).toContain('Updated 10/20/2026');
    expect(rows[0].textContent).toContain('Need by 11/5/2026');
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
    expect(link.getAttribute('href')).toBe('/client-parts');
  });

  it('hides the list section when there are no lists', () => {
    const c = mount({ lists: [] });
    expect(c.textContent).not.toContain('Start from a list');
  });
});
