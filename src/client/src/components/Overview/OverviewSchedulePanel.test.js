import React, { act } from 'react';
import { render } from '../../testUtils/render';
import Overview from './Overview';
import { apiFetch } from '../../api/apiFetch';

jest.mock('../../api/apiFetch', () => ({ apiFetch: jest.fn() }));
jest.mock('../AdminLayout/AdminLayout', () => ({ actions, children }) => <>{actions}{children}</>);
jest.mock('../PdfImage', () => ({ PdfThumbnail: () => <div className="thumb" /> }));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const reply = (body, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => body });

const part = (over) => ({
  job_part_id: 1, part_id: 11, number: 'HSX2-0870', rev: 'C', description: 'Bracket', material: '6061', finish: 'Anodize',
  quantity: 10, price: 12.5, status: 'running_machine_a', urgent: false, waiting: false, since: null, paired: false, ...over,
});

const OVERVIEW = {
  headline: { active_parts: 2, due_soon: 0, overdue: 0 },
  contacts: [],
  jobs: [
    { id: 100, job_number: '13804', company_name: 'Acme', attention: 'Kim', po_number: 'PO1', invoice_number: null, parts: [part({})] },
    { id: 101, job_number: '13805', company_name: 'Beta', attention: 'Lee', po_number: 'PO2', invoice_number: null, parts: [part({ job_part_id: 2, status: 'qa' })] },
  ],
};

const MACH = { key: 'machining', label: 'Machining' };
const INSP = { key: 'inspection', label: 'Inspection' };
const SCHEDULE = {
  window: { start: '2026-10-26', end: '2026-11-22' },
  board: [
    { id: 100, job_number: 'J-100', stage: MACH, part_count: 1, own: true, created_at: '2026-10-28', due_date: '2026-11-03' },
    { id: 101, job_number: 'J-101', stage: INSP, part_count: 1, own: true, created_at: '2026-10-28', due_date: '2026-11-04' },
  ],
  undated: [{ id: 101, job_number: 'U-101', stage: INSP }, { id: 100, job_number: 'U-100', stage: MACH }],
};

const setup = async (scheduleReply = reply(SCHEDULE)) => {
  apiFetch.mockImplementation(async (path) => {
    if (path === '/internal/job/overview') return reply(OVERVIEW);
    if (path === '/internal/job/schedule') return scheduleReply;
    throw new Error(`unexpected ${path}`);
  });
  let view;
  await act(async () => { view = render(<Overview />); });
  const c = view.container;
  return {
    c,
    click: (el) => act(async () => { el.click(); }),
    btn: (text) => [...c.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith(text)),
    rowTexts: () => [...c.querySelectorAll('.ov-sched .portal-board-row')].map((r) => r.textContent),
  };
};

afterEach(() => { apiFetch.mockReset(); document.body.innerHTML = ''; });

test('shows the schedule between the stage strip and the jobs, in the list view', async () => {
  const { c } = await setup();
  const strip = c.querySelector('.ov-strip');
  const sched = c.querySelector('.ov-sched');
  const job = c.querySelector('section.ov-job');
  expect(sched.textContent).toContain('J-100');
  expect(strip.compareDocumentPosition(sched) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(sched.compareDocumentPosition(job) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

test('shows the schedule above the stage board in the board view', async () => {
  const { c, click, btn } = await setup();
  await click(btn('Stage board'));
  const sched = c.querySelector('.ov-sched');
  expect(sched.textContent).toContain('J-100');
  expect(c.querySelector('.ov-strip').compareDocumentPosition(sched) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(c.querySelector('section.ov-job')).toBeNull();
});

test('a picked stage keeps only board and undated jobs in the filtered list', async () => {
  const { c, click, rowTexts } = await setup();
  expect(rowTexts()).toHaveLength(4);
  const machining = [...c.querySelectorAll('.ov-strip button')].find((b) => b.textContent.startsWith('Machining'));
  await click(machining);
  const rows = rowTexts();
  expect(rows).toHaveLength(2);
  expect(rows.join('|')).toContain('J-100');
  expect(rows.join('|')).toContain('U-100');
  expect(rows.join('|')).not.toContain('101');
});

test('a schedule row links to the admin job page', async () => {
  const { c } = await setup();
  const hrefs = [...c.querySelectorAll('.ov-sched a.portal-board-row')].map((a) => a.getAttribute('href'));
  expect(hrefs).toEqual(['/job/100', '/job/101', '/job/101', '/job/100']);
});

test('a failed schedule fetch hides the panel and the rest of the page renders', async () => {
  const { c } = await setup(reply({}, false));
  expect(c.querySelector('.ov-sched')).toBeNull();
  expect(c.querySelectorAll('section.ov-job')).toHaveLength(2);
});

test('a rejected schedule fetch hides the panel too', async () => {
  apiFetch.mockImplementation(async (path) => {
    if (path === '/internal/job/overview') return reply(OVERVIEW);
    throw new Error('network');
  });
  let view;
  await act(async () => { view = render(<Overview />); });
  expect(view.container.querySelector('.ov-sched')).toBeNull();
  expect(view.container.querySelectorAll('section.ov-job')).toHaveLength(2);
});

test('a schedule reply without a board hides the panel', async () => {
  const { c } = await setup(reply([]));
  expect(c.querySelector('.ov-sched')).toBeNull();
  expect(c.querySelectorAll('section.ov-job')).toHaveLength(2);
});
