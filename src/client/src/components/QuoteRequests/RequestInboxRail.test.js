import React, { act } from 'react';
import { render } from '../../testUtils/render';
import RequestInboxRail from './RequestInboxRail';
import { listInbox } from '../../api/quoteRequestsAdminApi';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));
jest.mock('../../api/quoteRequestsAdminApi', () => ({
  listInbox: jest.fn(),
  requestStatusLabel: (s) => ({ sent: 'Sent', in_review: 'In review', job_created: 'Job created' })[s] ?? String(s),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const ROWS = [
  { id: 7, company_name: 'Acme', name: 'Bracket order', line_count: 3, submitted_at: '2026-10-20T12:00:00', status: 'sent', job_number: null },
  { id: 5, company_name: 'Gamma', name: 'Pins', line_count: 2, submitted_at: '2026-10-15T12:00:00', status: 'in_review', job_number: null },
  { id: 4, company_name: 'Beta', name: 'Flanges', line_count: 1, submitted_at: '2026-10-10T12:00:00', status: 'job_created', job_number: 'J-900' },
  { id: 3, company_name: 'Delta', name: 'Shafts', line_count: 4, submitted_at: '2026-10-09T12:00:00', status: 'sent', job_number: null },
];

async function mount(props = {}) {
  let view;
  await act(async () => {
    view = render(<RequestInboxRail {...props} />);
  });
  return view;
}
const tabs = (view) => [...view.container.querySelectorAll('.tabs button')];
const rowsOf = (view) => [...view.container.querySelectorAll('.rq')];

beforeEach(() => {
  mockNavigate.mockClear();
  listInbox.mockReset();
  listInbox.mockResolvedValue({ ok: true, data: ROWS });
});

test('loads once with no status and shows tabs with counts', async () => {
  const view = await mount();
  expect(listInbox).toHaveBeenCalledTimes(1);
  expect(listInbox).toHaveBeenCalledWith();
  expect(tabs(view).map((b) => b.textContent)).toEqual(['All 4', 'Sent 2', 'In review 1', 'Job created 1']);
  view.unmount();
});

test('each row shows padded number, company, name, lines, date and job number', async () => {
  const view = await mount();
  const rows = rowsOf(view);
  expect(rows).toHaveLength(4);
  expect(rows[0].textContent).toContain('REQ-0007');
  expect(rows[0].textContent).toContain('Acme');
  expect(rows[0].textContent).toContain('Bracket order');
  expect(rows[0].textContent).toContain('3 lines');
  expect(rows[0].textContent).toContain('10/20/2026');
  expect(rows[2].textContent).toContain('J-900');
  expect(rows[0].textContent).not.toContain('J-');
  view.unmount();
});

test('tab filters client-side without reloading', async () => {
  const view = await mount();
  await act(async () => tabs(view)[1].click());
  expect(rowsOf(view).map((r) => r.textContent.slice(0, 8))).toEqual(['REQ-0007', 'REQ-0003']);
  await act(async () => tabs(view)[3].click());
  expect(rowsOf(view)).toHaveLength(1);
  expect(tabs(view)[3].className).toContain('on');
  expect(listInbox).toHaveBeenCalledTimes(1);
  view.unmount();
});

test('highlights currentId and dims job_created rows', async () => {
  const view = await mount({ currentId: 5 });
  const rows = rowsOf(view);
  expect(rows.map((r) => r.classList.contains('cur'))).toEqual([false, true, false, false]);
  expect(rows.map((r) => r.classList.contains('done'))).toEqual([false, false, true, false]);
  view.unmount();
});

test('clicking a row navigates to the request', async () => {
  const view = await mount();
  await act(async () => rowsOf(view)[2].click());
  expect(mockNavigate).toHaveBeenCalledWith('/quote-request/4');
  view.unmount();
});

test('shows loading and error messages', async () => {
  let resolve;
  listInbox.mockReturnValueOnce(new Promise((r) => { resolve = r; }));
  let view;
  await act(async () => {
    view = render(<RequestInboxRail />);
  });
  expect(view.container.textContent).toContain('Loading');
  await act(async () => resolve({ ok: false, error: { kind: 'error', message: 'Boom happened' } }));
  expect(view.container.textContent).toContain('Boom happened');
  expect(view.container.querySelector('.tabs')).toBeNull();
  view.unmount();
});
