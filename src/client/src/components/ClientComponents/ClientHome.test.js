import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import ClientHome from './ClientHome';
import { listJobs } from '../../api/portalApi';

jest.mock('../../api/portalApi', () => ({
  ...jest.requireActual('../../api/portalApi'),
  listJobs: jest.fn(),
}));

global.IS_REACT_ACT_ENVIRONMENT = true;

const job = (id, jobNumber) => ({ id, job_number: jobNumber });
const page = (jobs) => ({
  ok: true,
  data: { jobs, pagination: { total: jobs.length, limit: 100, offset: 0, hasMore: false } },
});
const failure = (kind, message) => ({ ok: false, error: { kind, message } });

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

const Landed = () => <div data-testid="landed">{useLocation().pathname}</div>;

let root;
let container;
const mount = async () => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(
      <MemoryRouter initialEntries={['/client-home']}>
        <Routes>
          <Route path="/client-home" element={<ClientHome />} />
          <Route path="/client-job/:id" element={<Landed />} />
        </Routes>
      </MemoryRouter>
    );
  });
  await flush();
  return container;
};

beforeEach(() => listJobs.mockReset());
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('ClientHome', () => {
  it('lands on the job with the highest job number, numeric-aware', async () => {
    listJobs.mockResolvedValueOnce(page([job(1, 'J-9'), job(2, 'J-10'), job(3, 'J-2')]));
    const c = await mount();
    expect(c.querySelector('[data-testid=landed]').textContent).toBe('/client-job/2');
  });

  it('calls listJobs once with limit 100 and offset 0', async () => {
    listJobs.mockResolvedValueOnce(page([job(1, 'J-1')]));
    await mount();
    expect(listJobs).toHaveBeenCalledTimes(1);
    expect(listJobs).toHaveBeenCalledWith({ limit: 100, offset: 0 });
  });

  it('shows "No jobs yet" for an empty list and stays on /client-home', async () => {
    listJobs.mockResolvedValueOnce(page([]));
    const c = await mount();
    expect(c.textContent).toContain('No jobs yet');
    expect(c.querySelector('[data-testid=landed]')).toBeNull();
  });

  it('shows the API error message when listJobs fails', async () => {
    listJobs.mockResolvedValueOnce(failure('busy', 'We are a little busy'));
    const c = await mount();
    expect(c.textContent).toContain('We are a little busy');
  });

  it('shows a loading message before the list arrives', async () => {
    listJobs.mockReturnValueOnce(new Promise(() => {}));
    const c = await mount();
    expect(c.textContent).toContain('Loading');
  });
});
