import React, { act } from 'react';
import { render } from '../../testUtils/render';
import ClientJob from './ClientJob';

global.IS_REACT_ACT_ENVIRONMENT = true;

const JOB = {
  id: 5,
  job_number: 'J-5',
  status: 'open',
  po_number: 'PO-77',
  po_date: '2024-01-02',
  due_date: '2024-03-05T00:00:00.000Z',
  ship_date: null,
  parts: [
    { job_part_id: 1, part_id: 11, part_number: 'BRK-100', rev: 'B', quantity: 25, status: 'in_production', unit_price: 12.5, part_description: 'Steel bracket' },
    { job_part_id: 2, part_id: 12, part_number: 'PIN-200', rev: null, quantity: 3, status: 'open', unit_price: null, part_description: null },
  ],
};

const ok = (body) => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => body, blob: async () => new Blob(['x']) });
const failure = (status) => ({ ok: false, status, headers: { get: () => null }, json: async () => ({}) });
const FILES = [
  { id: 31, filename: 'brk.pdf', mimetype: 'application/pdf', size: 1, uploaded_at: null },
  { id: 32, filename: 'brk.step', mimetype: 'application/octet-stream', size: 1, uploaded_at: null },
  { id: 33, filename: 'notes.txt', mimetype: 'text/plain', size: 1, uploaded_at: null },
];

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

let view;
const mount = async () => {
  view = render(<ClientJob />, { path: '/client-job/5', route: '/client-job/:id' });
  await flush();
  return view.container;
};
const toggle = (c, i) => c.querySelectorAll('.portal-card')[i].querySelector('button[aria-expanded]');
const click = async (el) => { await act(async () => { el.click(); }); await flush(); };
const urls = () => global.fetch.mock.calls.map((call) => call[0]);

beforeEach(() => {
  global.fetch = jest.fn();
  global.URL.createObjectURL = jest.fn(() => 'blob:x');
  global.URL.revokeObjectURL = jest.fn();
});
afterEach(() => view && view.unmount());

describe('ClientJob', () => {
  it('shows the job header, meta row and a back link', async () => {
    global.fetch.mockResolvedValueOnce(ok(JOB));
    const c = await mount();
    expect(urls()[0]).toMatch(/\/portal\/jobs\/5$/);
    expect(c.querySelector('h1').textContent).toBe('Job J-5');
    expect(c.querySelector('.portal-meta .portal-badge').textContent).toBe('Open');
    const meta = c.querySelector('.portal-fields').textContent;
    expect(meta).toContain('PO-77');
    expect(meta).toContain('1/2/2024');
    expect(meta).toContain('3/5/2024');
    const back = [...c.querySelectorAll('a')].find((a) => a.textContent === 'Back to your jobs');
    expect(back.getAttribute('href')).toBe('/client-home');
  });

  it('shows each part number, rev, quantity, status label and price as currency', async () => {
    global.fetch.mockResolvedValueOnce(ok(JOB));
    const c = await mount();
    const cards = c.querySelectorAll('.portal-card');
    expect(cards).toHaveLength(2);
    expect(c.querySelector('table')).toBeNull();
    const [a, b] = [...cards].map((x) => x.textContent);
    expect(a).toContain('BRK-100');
    expect(a).toContain('Rev B');
    expect(a).toContain('Qty 25');
    expect(a).toContain('Unit price');
    expect(a.includes('Steel bracket')).toBe(true);
    expect(cards[0].classList.contains('portal-part')).toBe(true);
    expect(cards[0].querySelector('.portal-part-desc').textContent).toBe('Steel bracket');
    expect(cards[0].querySelector('button[aria-expanded]').textContent).toBe('Show files');
    expect(a).toContain('In Production');
    expect(a).toContain('$12.50');
    expect(b).toContain('PIN-200');
    expect(b).toContain('Qty 3');
    expect(b).not.toContain('Rev');
    expect(b).not.toContain('Unit price');
    expect(b).not.toContain('$');
    expect(b).not.toContain('—');
    expect(cards[1].querySelector('.portal-part-desc')).toBeNull();
  });

  it('hides PO, PO date, Due and Ship in the header when they are null', async () => {
    global.fetch.mockResolvedValueOnce(ok({ ...JOB, po_number: null, po_date: null, due_date: null, ship_date: null }));
    const c = await mount();
    const header = c.querySelector('.portal-fields').textContent;
    for (const label of ['PO', 'Due', 'Ship']) expect(header).not.toContain(label);
    expect(c.textContent).not.toContain('—');
  });

  it('fetches part files only on first expand and labels their kind', async () => {
    global.fetch.mockResolvedValueOnce(ok(JOB)).mockResolvedValueOnce(ok(FILES));
    const c = await mount();
    expect(toggle(c, 0).getAttribute('aria-expanded')).toBe('false');
    expect(toggle(c, 0).textContent).toBe('Show files');
    await click(toggle(c, 0));
    expect(urls()[1]).toMatch(/\/portal\/parts\/11\/files$/);
    expect(toggle(c, 0).getAttribute('aria-expanded')).toBe('true');
    expect(toggle(c, 0).textContent).toBe('Hide files');
    const rows = [...c.querySelectorAll('.portal-file')];
    expect(rows.map((r) => r.querySelector('.portal-file-kind').textContent)).toEqual(['Drawing', 'STEP', 'Other']);
    expect(rows[0].textContent).toContain('brk.pdf');
    await click(toggle(c, 0));
    expect(c.querySelectorAll('.portal-file')).toHaveLength(0);
    await click(toggle(c, 0));
    expect(c.querySelectorAll('.portal-file')).toHaveLength(3);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('shows an empty message when a part has no files', async () => {
    global.fetch.mockResolvedValueOnce(ok(JOB)).mockResolvedValueOnce(ok([]));
    const c = await mount();
    await click(toggle(c, 0));
    expect(c.textContent).toContain('No files for this part yet.');
  });

  it('shows an inline error when listing files fails', async () => {
    global.fetch.mockResolvedValueOnce(ok(JOB)).mockResolvedValueOnce(failure(500));
    const c = await mount();
    await click(toggle(c, 0));
    expect(c.querySelector('.portal-card [role="alert"], .portal-card .portal-error').textContent).toContain('Something went wrong');
    expect(c.querySelectorAll('.portal-card')).toHaveLength(2);
  });

  it('shows Sign in again when listing files returns 401', async () => {
    global.fetch.mockResolvedValueOnce(ok(JOB)).mockResolvedValueOnce(failure(401));
    const c = await mount();
    await click(toggle(c, 0));
    const link = [...c.querySelectorAll('.portal-card a')].find((a) => a.textContent === 'Sign in again');
    expect(link.getAttribute('href')).toBe('/client-login');
  });

  it('shows the busy message when listing files returns 429', async () => {
    global.fetch.mockResolvedValueOnce(ok(JOB)).mockResolvedValueOnce(failure(429));
    const c = await mount();
    await click(toggle(c, 0));
    expect(c.querySelector('.portal-card').textContent).toContain('We are a little busy');
  });

  it('shows the busy message when a download returns 429', async () => {
    global.fetch.mockResolvedValueOnce(ok(JOB)).mockResolvedValueOnce(ok(FILES)).mockResolvedValueOnce(failure(429));
    const c = await mount();
    await click(toggle(c, 0));
    await click(c.querySelectorAll('.portal-file')[0].querySelector('button.portal-button'));
    expect(c.querySelector('.portal-card').textContent).toContain('We are a little busy');
  });

  it('gives a shipped job badge portal-badge--shipped and an open one not', async () => {
    global.fetch.mockResolvedValueOnce(ok({ ...JOB, status: 'shipped' }));
    let c = await mount();
    expect(c.querySelector('.portal-meta .portal-badge--shipped').textContent).toBe('Shipped');
    view.unmount();
    global.fetch.mockResolvedValueOnce(ok(JOB));
    c = await mount();
    expect(c.querySelector('.portal-meta .portal-badge')).not.toBeNull();
    expect(c.querySelector('.portal-badge--shipped')).toBeNull();
  });

  it('Download requests /portal/files/:id', async () => {
    global.fetch.mockResolvedValueOnce(ok(JOB)).mockResolvedValueOnce(ok(FILES)).mockResolvedValueOnce(ok({}));
    const c = await mount();
    await click(toggle(c, 0));
    const button = c.querySelectorAll('.portal-file')[1].querySelector('button.portal-button');
    expect(button.textContent).toBe('Download');
    await click(button);
    expect(urls()[2]).toMatch(/\/portal\/files\/32$/);
  });

  it.each([
    [404, "We couldn't find that job"],
    [401, 'You are signed out'],
    [429, 'We are a little busy'],
  ])('shows the right message for a %i job response', async (status, text) => {
    global.fetch.mockResolvedValueOnce(failure(status));
    const c = await mount();
    expect(c.textContent).toContain(text);
    expect(c.querySelectorAll('.portal-card')).toHaveLength(0);
  });

  it('shows a loading message before the job arrives', async () => {
    global.fetch.mockReturnValueOnce(new Promise(() => {}));
    const c = await mount();
    expect(c.textContent).toContain('Loading');
  });
});
