import React, { act } from 'react';
import { render } from '../../testUtils/render';
import JobList from './JobList';
import { listJobs } from '../../api/portalApi';
import { listNotes } from '../../api/portalNotesApi';

jest.mock('../../api/portalApi', () => ({
  ...jest.requireActual('../../api/portalApi'),
  listJobs: jest.fn(),
}));
jest.mock('../../api/portalNotesApi', () => ({ listNotes: jest.fn(), addNote: jest.fn() }));

global.IS_REACT_ACT_ENVIRONMENT = true;

const job = (id) => ({
  id,
  job_number: `J-${id}`,
  po_number: `PO-${id}`,
  due_date: '2024-03-05T00:00:00.000Z',
  stage: { key: 'machining', label: 'Machining' },
  flag: null,
  parts: [{ job_part_id: 1, stage: { key: 'machining', label: 'Machining' } }],
});

const page = (jobs, { total = jobs.length, hasMore = false, offset = 0 } = {}) => ({
  ok: true,
  data: { jobs, pagination: { total, limit: 20, offset, hasMore } },
});
const note = { id: 1, content: 'Hi', author: 'Jo', is_client: true, created_at: '2026-10-01T00:00:00Z' };

const flush = () => act(async () => { await Promise.resolve(); });
const advance = (ms) => act(async () => { jest.advanceTimersByTime(ms); });

let view;
const mount = async (props) => {
  view = render(<JobList {...props} />);
  await flush();
  return view.container;
};
const type = async (c, value) => {
  const input = c.querySelector('input[type="search"]');
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};
const olderButton = (c) => [...c.querySelectorAll('button')].find((b) => /older jobs?$/.test(b.textContent));

beforeEach(() => {
  jest.useFakeTimers();
  listJobs.mockReset();
  listNotes.mockReset();
  listNotes.mockResolvedValue({ ok: true, data: { jobs: {}, parts: {} } });
});
afterEach(() => {
  view && view.unmount();
  jest.useRealTimers();
});

describe('JobList', () => {
  it('shows Your jobs with the pagination total and a labelled search input', async () => {
    listJobs.mockResolvedValueOnce(page([job(1)], { total: 42, hasMore: true }));
    const c = await mount();
    expect(c.querySelector('.portal-joblist-head').textContent).toContain('Your jobs · 42');
    expect(c.querySelector('input[type="search"]').getAttribute('aria-label')).toBe('Job, PO or part number');
  });

  it('refetches with q only after a 300 ms pause and replaces the rows', async () => {
    listJobs.mockResolvedValueOnce(page([job(1), job(2)])).mockResolvedValueOnce(page([job(3)]));
    const c = await mount();
    await type(c, 'PO-3');
    await advance(299);
    expect(listJobs).toHaveBeenCalledTimes(1);
    await advance(1);
    await flush();
    expect(listJobs).toHaveBeenLastCalledWith({ limit: 20, offset: 0, q: 'PO-3' });
    expect([...c.querySelectorAll('a.portal-job-row')].map((a) => a.getAttribute('href'))).toEqual(['/client-job/3']);
  });

  it('shows No jobs match when a search returns nothing', async () => {
    listJobs.mockResolvedValueOnce(page([job(1)])).mockResolvedValueOnce(page([]));
    const c = await mount();
    await type(c, 'zzz');
    await advance(300);
    await flush();
    expect(c.querySelector('.portal-message h2').textContent).toBe('No jobs match');
    expect(c.querySelectorAll('a.portal-job-row')).toHaveLength(0);
  });

  it('reads N older jobs as total minus shown and loads the next offset keeping q', async () => {
    listJobs
      .mockResolvedValueOnce(page([job(1), job(2)], { total: 5, hasMore: true }))
      .mockResolvedValueOnce(page([job(3), job(4), job(5)], { total: 5, offset: 20 }));
    const c = await mount();
    expect(olderButton(c).textContent).toBe('3 older jobs');
    await act(async () => { olderButton(c).click(); });
    await flush();
    expect(listJobs).toHaveBeenLastCalledWith({ limit: 20, offset: 20 });
    expect(c.querySelectorAll('a.portal-job-row')).toHaveLength(5);
    expect(olderButton(c)).toBeUndefined();
  });

  it('passes compact to rows and marks the current job', async () => {
    listJobs.mockResolvedValueOnce(page([job(1), job(2)]));
    const c = await mount({ compact: true, currentId: 2 });
    expect(c.querySelectorAll('.portal-job-row--compact')).toHaveLength(2);
    const current = [...c.querySelectorAll('a.portal-job-row')].filter((a) => a.getAttribute('aria-current') === 'page');
    expect(current.map((a) => a.getAttribute('href'))).toEqual(['/client-job/2']);
  });

  it('fetches its own notes when none are given', async () => {
    listJobs.mockResolvedValueOnce(page([job(1)]));
    listNotes.mockResolvedValue({ ok: true, data: { jobs: { 1: [note] }, parts: {} } });
    const c = await mount();
    expect(listNotes).toHaveBeenCalledTimes(1);
    expect(c.querySelector('.portal-pin').textContent).toBe('1');
  });

  it('uses the notes prop and skips listNotes when given', async () => {
    listJobs.mockResolvedValueOnce(page([job(1)]));
    const c = await mount({ notes: { 1: [note, { ...note, id: 2 }] }, onNoteAdded: () => {} });
    expect(listNotes).not.toHaveBeenCalled();
    expect(c.querySelector('.portal-pin').textContent).toBe('2');
  });

  it('shows the API error message when listJobs fails', async () => {
    listJobs.mockResolvedValueOnce({ ok: false, error: { kind: 'busy', message: 'We are a little busy' } });
    const c = await mount();
    expect(c.textContent).toContain('We are a little busy');
  });
});
