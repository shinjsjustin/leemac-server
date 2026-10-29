import React, { act } from 'react';
import { render } from '../../testUtils/render';
import ClientHome from './ClientHome';
import { listJobs } from '../../api/portalApi';
import { listNotes } from '../../api/portalNotesApi';

jest.mock('../../api/portalApi', () => ({
  ...jest.requireActual('../../api/portalApi'),
  listJobs: jest.fn(),
}));
jest.mock('../../api/portalNotesApi', () => ({ listNotes: jest.fn(), addNote: jest.fn() }));

global.IS_REACT_ACT_ENVIRONMENT = true;

const job = (id, over = {}) => ({
  id,
  job_number: `J-${id}`,
  po_number: `PO-${id}`,
  due_date: '2024-03-05T00:00:00.000Z',
  stage: { key: 'machining', label: 'Machining' },
  flag: null,
  parts: [{ job_part_id: 1, stage: { key: 'machining', label: 'Machining' } }],
  ...over,
});

const page = (jobs, hasMore = false) => ({
  ok: true,
  data: { jobs, pagination: { total: jobs.length, limit: 20, offset: 0, hasMore } },
});
const failure = (kind, message) => ({ ok: false, error: { kind, message } });
const note = { id: 1, content: 'Hi', author: 'Jo', is_client: true, created_at: '2026-10-01T00:00:00Z' };

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

let view;
const mount = async () => {
  view = render(<ClientHome />);
  await flush();
  return view.container;
};

beforeEach(() => {
  listJobs.mockReset();
  listNotes.mockReset();
  listNotes.mockResolvedValue({ ok: true, data: { jobs: {}, parts: {} } });
});
afterEach(() => view && view.unmount());

describe('ClientHome', () => {
  it('lists a JobRow per job linking to its page, and no Parts title link', async () => {
    listJobs.mockResolvedValueOnce(page([job(7), job(9)]));
    const c = await mount();
    expect(listJobs).toHaveBeenCalledWith({ limit: 20, offset: 0 });
    const hrefs = [...c.querySelectorAll('a.portal-job-row')].map((x) => x.getAttribute('href'));
    expect(hrefs).toEqual(['/client-job/7', '/client-job/9']);
    expect(c.querySelector('.portal-title-row a.portal-link')).toBeNull();
  });

  it('gives each row that job\'s notes from one listNotes call', async () => {
    listJobs.mockResolvedValueOnce(page([job(1), job(2)]));
    listNotes.mockResolvedValue({ ok: true, data: { jobs: { 2: [note, { ...note, id: 2 }] }, parts: {} } });
    const c = await mount();
    expect(listNotes).toHaveBeenCalledTimes(1);
    expect([...c.querySelectorAll('.portal-pin')].map((x) => x.textContent)).toEqual(['0', '2']);
  });

  it('still shows rows when listNotes fails', async () => {
    listJobs.mockResolvedValueOnce(page([job(1)]));
    listNotes.mockResolvedValue(failure('error', 'nope'));
    const c = await mount();
    expect(c.querySelectorAll('a.portal-job-row')).toHaveLength(1);
    expect(c.querySelector('.portal-message')).toBeNull();
  });

  it('Load more requests the next offset, appends jobs and hides when done', async () => {
    listJobs.mockResolvedValueOnce(page([job(1)], true)).mockResolvedValueOnce(page([job(2)], false));
    const c = await mount();
    const button = () => [...c.querySelectorAll('button.portal-button')].find((b) => b.textContent === 'Load more');
    await act(async () => { button().click(); });
    await flush();
    expect(listJobs).toHaveBeenLastCalledWith({ limit: 20, offset: 20 });
    expect(c.querySelectorAll('a.portal-job-row')).toHaveLength(2);
    expect(button()).toBeUndefined();
    expect(listNotes).toHaveBeenCalledTimes(1);
  });

  it('hides Load more when hasMore is false', async () => {
    listJobs.mockResolvedValueOnce(page([job(1)], false));
    const c = await mount();
    expect(c.textContent).not.toContain('Load more');
  });

  it('shows the empty state for zero jobs', async () => {
    listJobs.mockResolvedValueOnce(page([]));
    const c = await mount();
    expect(c.querySelectorAll('.portal-message')).toHaveLength(1);
    expect(c.textContent).toContain("You don't have any jobs with us yet.");
  });

  it('shows the API error message when listJobs fails', async () => {
    listJobs.mockResolvedValueOnce(failure('busy', 'We are a little busy'));
    const c = await mount();
    expect(c.textContent).toContain('We are a little busy');
  });

  it('shows a loading message before the first page arrives', async () => {
    listJobs.mockReturnValueOnce(new Promise(() => {}));
    const c = await mount();
    expect(c.textContent).toContain('Loading');
  });
});
