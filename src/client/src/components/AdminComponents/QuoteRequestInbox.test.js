import React, { act } from 'react';
import { render } from '../../testUtils/render';
import QuoteRequestInbox from './QuoteRequestInbox';
import { listInbox } from '../../api/quoteRequestsAdminApi';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));
jest.mock('../Navbar', () => () => null);
jest.mock('../../api/quoteRequestsAdminApi', () => ({
  listInbox: jest.fn(),
  requestStatusLabel: (s) => ({ sent: 'Sent', in_review: 'In review', job_created: 'Job created' })[s] ?? String(s),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const ROWS = [
  { id: 7, company_name: 'Acme', name: 'Bracket order', line_count: 3, need_by: '2026-11-05', submitted_at: '2026-10-20T12:00:00', status: 'sent', job_number: null },
  { id: 4, company_name: 'Beta', name: null, line_count: 1, need_by: null, submitted_at: '2026-10-10T12:00:00', status: 'job_created', job_number: 'J-900' },
];

async function mount() {
  let view;
  await act(async () => {
    view = render(<QuoteRequestInbox />);
  });
  return view;
}

beforeEach(() => {
  mockNavigate.mockClear();
  listInbox.mockReset();
  listInbox.mockResolvedValue({ ok: true, data: ROWS });
});

test('renders rows in returned order with name fallback, status label and job number', async () => {
  const view = await mount();
  const rows = [...view.container.querySelectorAll('tbody tr')];
  expect(rows).toHaveLength(2);
  const first = [...rows[0].querySelectorAll('td')].map((td) => td.textContent);
  expect(first.slice(0, 3)).toEqual(['Acme', 'Bracket order', '3']);
  expect(first[3]).toContain('11');
  expect(first[5]).toBe('Sent');
  const second = [...rows[1].querySelectorAll('td')].map((td) => td.textContent);
  expect(second[0]).toBe('Beta');
  expect(second[1]).toBe('Request #4');
  expect(second[5]).toBe('Job created');
  expect(second[6]).toBe('J-900');
  expect(view.container.textContent).toContain('Quote Requests');
  expect(listInbox).toHaveBeenCalledWith(undefined);
  view.unmount();
});

test('status filter reloads with that status and All passes none', async () => {
  const view = await mount();
  const select = view.container.querySelector('select');
  expect([...select.options].map((o) => o.textContent)).toEqual(['All', 'Sent', 'In review', 'Job created']);
  const change = async (value) => {
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
      setter.call(select, value);
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
  };
  await change('in_review');
  expect(listInbox).toHaveBeenLastCalledWith('in_review');
  await change('');
  expect(listInbox).toHaveBeenLastCalledWith(undefined);
  view.unmount();
});

test('clicking a row navigates to the request page', async () => {
  const view = await mount();
  await act(async () => {
    view.container.querySelectorAll('tbody tr')[1].click();
  });
  expect(mockNavigate).toHaveBeenCalledWith('/quote-request/4');
  view.unmount();
});

test('shows loading, empty and error messages', async () => {
  let resolve;
  listInbox.mockReturnValueOnce(new Promise((r) => { resolve = r; }));
  let view;
  await act(async () => {
    view = render(<QuoteRequestInbox />);
  });
  expect(view.container.textContent).toContain('Loading');
  await act(async () => resolve({ ok: true, data: [] }));
  expect(view.container.textContent).toContain('No quote requests yet.');
  view.unmount();

  listInbox.mockResolvedValue({ ok: false, error: { kind: 'error', message: 'Boom happened' } });
  view = await mount();
  expect(view.container.textContent).toContain('Boom happened');
  expect(view.container.textContent).not.toContain('No quote requests yet.');
  view.unmount();
});
