import React, { act } from 'react';
import { render } from '../../testUtils/render';
import ClientJob from './ClientJob';
import { getJob, listJobs, listPartFiles, downloadFile } from '../../api/portalApi';
import { listNotes } from '../../api/portalNotesApi';

jest.mock('../../api/portalApi', () => ({
  ...jest.requireActual('../../api/portalApi'),
  getJob: jest.fn(),
  listJobs: jest.fn(),
  listPartFiles: jest.fn(),
  downloadFile: jest.fn(),
}));
jest.mock('../../api/portalNotesApi', () => ({ listNotes: jest.fn(), addNote: jest.fn() }));
jest.mock('./DrawingTile', () => ({ file, onOpen }) => (
  <button type="button" className="fake-tile" onClick={() => onOpen && onOpen(file)}>{file ? file.filename : 'none'}</button>
));

global.IS_REACT_ACT_ENVIRONMENT = true;

const MACHINING = { key: 'machining', label: 'Machining' };
const DONE = { key: 'done', label: 'Done' };
const JOB = {
  id: 5,
  job_number: 'J-5',
  status: 'open',
  po_number: 'PO-77',
  po_date: '2026-10-14',
  due_date: '2026-11-03T00:00:00.000Z',
  ship_date: null,
  stage: MACHINING,
  flag: 'due_soon',
  parts: [
    { job_part_id: 1, part_id: 11, part_number: 'BRK-100', rev: 'B', quantity: 25, stage: MACHINING, unit_price: 12.5, part_description: 'Steel bracket', material: '303 SS', finish: 'Passivate' },
    { job_part_id: 2, part_id: 12, part_number: 'PIN-200', rev: null, quantity: 3, stage: DONE, unit_price: null, part_description: null, material: null, finish: null },
    { job_part_id: 3, part_id: 11, part_number: 'BRK-100', rev: 'B', quantity: 5, stage: MACHINING, unit_price: 11, part_description: 'Steel bracket', material: '303 SS', finish: null },
  ],
};
const OTHER_JOB = { ...JOB, id: 4, job_number: 'J-4', due_date: '2026-10-01', stage: DONE, flag: null, parts: [JOB.parts[1]] };

const FILES_11 = [
  { id: 31, filename: 'brk.step', mimetype: 'application/octet-stream' },
  { id: 32, filename: 'brk.pdf', mimetype: 'application/pdf' },
  { id: 33, filename: 'other.pdf', mimetype: 'application/pdf' },
];
const FILES_12 = [{ id: 41, filename: 'pin.pdf', mimetype: 'application/pdf' }];

const note = (id, content, isClient = true) => ({ id, author: 'Ann Lee', is_client: isClient, created_at: '2026-10-20T10:00:00Z', content });
const NOTES = { jobs: { 5: [note(1, 'job note one'), note(2, 'from Leemac', false)] }, parts: { 11: [note(3, 'part note')] } };

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

let view;
const mount = async () => {
  view = render(<ClientJob />, { path: '/client-job/5', route: '/client-job/:id' });
  await flush();
  return view.container;
};
const click = async (el) => { await act(async () => { el.click(); }); await flush(); };
const button = (c, text) => [...c.querySelectorAll('button')].find((b) => b.textContent === text);

beforeEach(() => {
  jest.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 9, 29, 12));
  getJob.mockResolvedValue({ ok: true, data: JOB });
  listJobs.mockResolvedValue({ ok: true, data: { jobs: [OTHER_JOB, JOB], pagination: {} } });
  listNotes.mockResolvedValue({ ok: true, data: NOTES });
  listPartFiles.mockImplementation(async (id) => ({ ok: true, data: id === 11 ? FILES_11 : FILES_12 }));
  downloadFile.mockResolvedValue({ ok: true });
});
afterEach(() => {
  view.unmount();
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

describe('ClientJob loading', () => {
  it('loads the job, the first page of jobs, notes, and files once per distinct part', async () => {
    await mount();
    expect(getJob).toHaveBeenCalledWith('5');
    expect(listJobs).toHaveBeenCalledWith();
    expect(listNotes).toHaveBeenCalledTimes(1);
    expect(listPartFiles.mock.calls.map((call) => call[0]).sort()).toEqual([11, 12]);
  });

  it('shows the error message when the job fails to load', async () => {
    getJob.mockResolvedValue({ ok: false, error: { kind: 'error', message: 'Boom' } });
    const c = await mount();
    expect(c.textContent).toContain('Something went wrong');
    expect(c.querySelector('.portal-part-card')).toBeNull();
  });
});

describe('left column', () => {
  it('lists every job as a compact row and marks only the current one', async () => {
    const c = await mount();
    const rows = [...c.querySelectorAll('.portal-job-list .portal-job-row--compact')];
    expect(rows.map((r) => r.querySelector('.portal-job-num').textContent)).toEqual(['J-4', 'J-5']);
    const current = c.querySelectorAll('.portal-job-list [aria-current]');
    expect(current).toHaveLength(1);
    expect(current[0].matches('a.portal-job-row')).toBe(true);
    expect(current[0].textContent).toContain('J-5');
  });
});

describe('job band', () => {
  it('shows Due with days left, PO and Ordered on one line', async () => {
    const c = await mount();
    const facts = c.querySelector('.portal-job-facts').textContent;
    expect(facts).toContain('Due');
    expect(facts).toContain('11/3/2026');
    expect(facts).toContain('5 days left');
    expect(facts).toContain('PO-77');
    expect(facts).toContain('Ordered');
    expect(facts).toContain('10/14/2026');
    expect(facts).not.toMatch(/Ship via|Buyer|From request/);
  });

  it('hides PO and Ordered when they are empty', async () => {
    getJob.mockResolvedValue({ ok: true, data: { ...JOB, po_number: '', po_date: null } });
    const c = await mount();
    const facts = c.querySelector('.portal-job-facts').textContent;
    expect(facts).not.toContain('PO');
    expect(facts).not.toContain('Ordered');
    expect(facts).toContain('Due');
  });

  it('counts a past due date as late and drops days left once shipped', async () => {
    getJob.mockResolvedValue({ ok: true, data: { ...JOB, due_date: '2026-10-27' } });
    let c = await mount();
    expect(c.querySelector('.portal-job-facts').textContent).toContain('2 days late');
    view.unmount();
    getJob.mockResolvedValue({ ok: true, data: { ...JOB, ship_date: '2026-10-28' } });
    c = await mount();
    expect(c.querySelector('.portal-job-facts').textContent).not.toMatch(/left|late/);
  });

  it('draws one segment per part and the stage badge with its flag', async () => {
    const c = await mount();
    const band = c.querySelector('.portal-job-band');
    expect(band.querySelectorAll('.portal-job-seg')).toHaveLength(3);
    expect(band.querySelector('.portal-stage').textContent).toBe('MachiningDue soon');
    expect(band.querySelector('h1').textContent).toBe('J-5');
  });
});

describe('part cards', () => {
  it('leads with the first drawing, then number, rev and stage, description and qty, material, finish and file count', async () => {
    const c = await mount();
    const cards = c.querySelectorAll('.portal-part-card');
    expect(cards).toHaveLength(3);
    const first = cards[0];
    expect(first.firstElementChild.className).toContain('fake-tile');
    expect(first.querySelector('.fake-tile').textContent).toBe('brk.pdf');
    expect(first.textContent).toMatch(/BRK-100.*Rev B.*Machining.*Steel bracket.*25.*303 SS.*Passivate.*3 files/);
    expect(first.textContent).not.toContain('$');
  });

  it('hides empty values on a sparse part', async () => {
    const c = await mount();
    const sparse = c.querySelectorAll('.portal-part-card')[1].textContent;
    expect(sparse).not.toMatch(/Rev|null|—|\$/);
    expect(sparse).toContain('PIN-200');
    expect(sparse).toContain('1 file');
    expect(sparse).not.toContain('1 files');
  });

  it('gives each card its own note pin showing that part\'s notes', async () => {
    const c = await mount();
    const pin = c.querySelectorAll('.portal-part-card')[0].parentElement.querySelector('.portal-pin');
    expect(pin.getAttribute('aria-label')).toBe('1 notes');
  });

  it('opens the part in a drawing window when its card is clicked', async () => {
    const c = await mount();
    expect(c.querySelector('.portal-window')).toBeNull();
    await click(c.querySelectorAll('.portal-part-card')[1]);
    const win = c.querySelector('.portal-window');
    expect(win.textContent).toContain('PIN-200');
    expect(win.querySelector('.fake-tile').textContent).toBe('pin.pdf');
  });
});

describe('Drawings or Table switch', () => {
  it('shows the parts as a table with unit price, and a row click opens the part', async () => {
    const c = await mount();
    expect(c.querySelector('table')).toBeNull();
    await click(button(c, 'Table'));
    expect(c.querySelector('.portal-part-card')).toBeNull();
    const rows = c.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(3);
    expect(rows[0].textContent).toContain('$12.50');
    expect(rows[0].textContent).toContain('BRK-100');
    expect(rows[1].textContent).not.toContain('$');
    await click(rows[0]);
    expect(c.querySelector('.portal-window').textContent).toContain('BRK-100');
    expect(c.querySelector('.portal-window .fake-tile').textContent).toBe('brk.pdf');
    await click(button(c, 'Drawings'));
    expect(c.querySelectorAll('.portal-part-card')).toHaveLength(3);
  });

  it('marks the active view with aria-pressed', async () => {
    const c = await mount();
    expect(button(c, 'Drawings').getAttribute('aria-pressed')).toBe('true');
    expect(button(c, 'Table').getAttribute('aria-pressed')).toBe('false');
  });
});

describe('right column', () => {
  it('lists the stage steps in order with only the job\'s stage marked', async () => {
    const c = await mount();
    const steps = [...c.querySelectorAll('.portal-steps li')];
    expect(steps.map((s) => s.textContent)).toEqual([
      'Quoted', 'In the shop', 'Material', 'Preparing', 'Machining', 'Outside finishing',
      'Finishing', 'Inspection', 'Packing', 'Done', 'Delivered', 'Invoiced',
    ]);
    const marked = steps.filter((s) => s.getAttribute('aria-current') === 'step');
    expect(marked.map((s) => s.textContent)).toEqual(['Machining']);
  });

  it('groups files by part with a Download button that downloads that file', async () => {
    const c = await mount();
    const groups = c.querySelectorAll('.portal-file-group');
    expect(groups).toHaveLength(2);
    expect(groups[0].querySelector('h3').textContent).toBe('BRK-100');
    expect(groups[0].querySelectorAll('.portal-file')).toHaveLength(3);
    await click(groups[0].querySelectorAll('.portal-file button')[1]);
    expect(downloadFile).toHaveBeenCalledWith(FILES_11[1]);
  });

  it('shows the error when a download fails', async () => {
    downloadFile.mockResolvedValue({ ok: false, error: { kind: 'error', message: 'Could not download' } });
    const c = await mount();
    await click(c.querySelector('.portal-file button'));
    expect(c.querySelector('[role="alert"]').textContent).toContain('Could not download');
  });

  it('puts the job notes pin on the notes heading', async () => {
    const c = await mount();
    const target = c.querySelector('.portal-job-notes .portal-pin-target');
    expect(target.querySelector('h2').textContent).toBe('Notes');
    expect(target.querySelector('.portal-pin').getAttribute('aria-label')).toBe('2 notes');
  });
});
