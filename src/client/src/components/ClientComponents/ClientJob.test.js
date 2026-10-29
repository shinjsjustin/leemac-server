import React, { act } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { render } from '../../testUtils/render';
import ClientJob from './ClientJob';
import { getJob, listJobs, listPartFiles, downloadFile } from '../../api/portalApi';
import { listNotes, addNote } from '../../api/portalNotesApi';

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

function Where() {
  return <output data-testid="where">{useLocation().pathname}</output>;
}
const where = (c) => c.querySelector('[data-testid="where"]').textContent;

let view;
const mount = async () => {
  view = render(
    <Routes>
      <Route path="/client-job/:id" element={<ClientJob />} />
      <Route path="/client-part/:id" element={<Where />} />
    </Routes>,
    { path: '/client-job/5' },
  );
  await flush();
  return view.container;
};
const click = async (el) => { await act(async () => { el.click(); }); await flush(); };
const button = (c, text) => [...c.querySelectorAll('button')].find((b) => b.textContent === text);

beforeEach(() => {
  jest.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 9, 29, 12));
  getJob.mockResolvedValue({ ok: true, data: JOB });
  listJobs.mockResolvedValue({ ok: true, data: { jobs: [OTHER_JOB, JOB], pagination: { hasMore: false, offset: 0, limit: 20, total: 2 } } });
  listNotes.mockResolvedValue({ ok: true, data: NOTES });
  listPartFiles.mockImplementation(async (id) => ({ ok: true, data: id === 11 ? FILES_11 : FILES_12 }));
  downloadFile.mockResolvedValue({ ok: true });
});
afterEach(() => {
  view.unmount();
  delete window.matchMedia;
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

describe('ClientJob loading', () => {
  it('loads the job, the first page of jobs, notes, and files once per distinct part', async () => {
    await mount();
    expect(getJob).toHaveBeenCalledWith('5');
    expect(listJobs).toHaveBeenCalledWith({ limit: 20, offset: 0, q: undefined });
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
  it('renders the shared compact JobList and marks only the current job', async () => {
    const c = await mount();
    expect(c.querySelector('aside.portal-job-list .portal-joblist')).not.toBeNull();
    const rows = [...c.querySelectorAll('.portal-job-list .portal-job-row--compact')];
    expect(rows.map((r) => r.querySelector('.portal-job-num').textContent)).toEqual(['J-4', 'J-5']);
    const current = c.querySelectorAll('.portal-job-list [aria-current]');
    expect(current).toHaveLength(1);
    expect(current[0].textContent).toContain('J-5');
  });
});

describe('job band', () => {
  it('renders no facts element when due date, PO and order date are all blank', async () => {
    getJob.mockResolvedValue({ ok: true, data: { ...JOB, due_date: null, po_number: '', po_date: null } });
    const c = await mount();
    expect(c.querySelector('.portal-job-band h1').textContent).toBe('J-5');
    expect(c.querySelector('.portal-job-facts')).toBeNull();
  });

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

describe('page chrome', () => {
  it('hides the layout title, goes wide and has no back link', async () => {
    const c = await mount();
    const title = c.querySelector('main > h1');
    expect(title.textContent).toBe('Job J-5');
    expect(title.className).toBe('portal-visually-hidden');
    expect(c.querySelector('main').className).toBe('portal portal--wide');
    expect(c.textContent).not.toContain('Back to your jobs');
    expect(c.querySelector('.portal-back-link')).toBeNull();
  });
});

describe('part cards', () => {
  it('shows the quantity with a times sign, a Rev chip and one chip per distinct file kind', async () => {
    const c = await mount();
    const [first, sparse] = c.querySelectorAll('.portal-part-card');
    expect(first.querySelector('.portal-part-qty').textContent).toBe('\u00d725');
    expect(first.querySelector('.portal-part-rev').textContent).toBe('Rev B');
    expect([...first.querySelectorAll('.portal-file-chip')].map((chip) => chip.textContent)).toEqual(['STEP', 'PDF']);
    expect([...sparse.querySelectorAll('.portal-file-chip')].map((chip) => chip.textContent)).toEqual(['PDF']);
  });

  it('captions the parts header with the lazy drawings hint', async () => {
    const c = await mount();
    expect(c.querySelector('.portal-job-parts-head').textContent).toContain('Drawings load as you scroll');
  });

  it('leads with the first drawing, then number, rev and stage, description and qty, material, finish and file chips', async () => {
    const c = await mount();
    const cards = c.querySelectorAll('.portal-part-card');
    expect(cards).toHaveLength(3);
    const first = cards[0];
    expect(first.firstElementChild.className).toContain('fake-tile');
    expect(first.querySelector('.fake-tile').textContent).toBe('brk.pdf');
    expect(first.textContent).toMatch(/BRK-100.*Rev B.*Machining.*Steel bracket.*\u00d725.*303 SS.*Passivate.*STEP.*PDF/);
    expect(first.textContent).not.toContain('$');
  });

  it('hides empty values on a sparse part', async () => {
    const c = await mount();
    const sparse = c.querySelectorAll('.portal-part-card')[1].textContent;
    expect(sparse).not.toMatch(/Rev|null|—|\$/);
    expect(sparse).toContain('PIN-200');
  });

  it('gives each card its own note pin showing that part\'s notes', async () => {
    const c = await mount();
    const pin = c.querySelectorAll('.portal-part-card')[0].parentElement.querySelector('.portal-pin');
    expect(pin.getAttribute('aria-label')).toBe('1 notes');
  });

  it('navigates to the part page when its card is clicked', async () => {
    const c = await mount();
    await click(c.querySelectorAll('.portal-part-card')[1]);
    expect(where(c)).toBe('/client-part/12');
  });

  it('navigates to the part page from the drawing tile', async () => {
    const c = await mount();
    await click(c.querySelectorAll('.portal-part-card')[0].querySelector('.fake-tile'));
    expect(where(c)).toBe('/client-part/11');
  });

  it('navigates to the part page from a card on a phone', async () => {
    window.matchMedia = jest.fn(() => ({ matches: true }));
    const c = await mount();
    await click(c.querySelectorAll('.portal-part-card')[1]);
    expect(where(c)).toBe('/client-part/12');
  });

});

describe('Drawings or Table switch', () => {
  it('shows the parts as a table with unit price, and a row click opens the part page', async () => {
    const c = await mount();
    expect(c.querySelector('table')).toBeNull();
    await click(button(c, 'Table'));
    expect(c.querySelector('.portal-part-card')).toBeNull();
    const rows = c.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(3);
    expect(rows[0].textContent).toContain('$12.50');
    expect(rows[0].textContent).toContain('BRK-100');
    expect(rows[1].textContent).not.toContain('$');
    await click(button(c, 'Drawings'));
    expect(c.querySelectorAll('.portal-part-card')).toHaveLength(3);
    await click(button(c, 'Table'));
    await click(c.querySelectorAll('tbody tr')[2]);
    expect(where(c)).toBe('/client-part/11');
  });

  it('navigates to the part page from a table row on a phone', async () => {
    window.matchMedia = jest.fn(() => ({ matches: true }));
    const c = await mount();
    await click(button(c, 'Table'));
    await click(c.querySelectorAll('tbody tr')[1]);
    expect(where(c)).toBe('/client-part/12');
  });

  it('marks the active view with aria-pressed', async () => {
    const c = await mount();
    expect(button(c, 'Drawings').getAttribute('aria-pressed')).toBe('true');
    expect(button(c, 'Table').getAttribute('aria-pressed')).toBe('false');
  });
});

describe('right column', () => {
  const STEP_NAMES = ['Ordered', 'In the shop', 'Machining', 'Inspection', 'Ships'];
  const steps = (c) => [...c.querySelectorAll('.portal-steps li')];
  const stepState = (c) => steps(c).map((s) => (s.getAttribute('aria-current') === 'step' ? 'current' : s.classList.contains('portal-step--done') ? 'done' : 'future'));

  it.each([
    ['open', ['done', 'current', 'future', 'future', 'future']],
    ['urgent', ['done', 'current', 'future', 'future', 'future']],
    ['machining', ['done', 'done', 'current', 'future', 'future']],
    ['shipped', ['done', 'done', 'done', 'done', 'current']],
  ])('lists 5 steps and marks done, current and future for a %s job', async (key, expected) => {
    getJob.mockResolvedValue({ ok: true, data: { ...JOB, stage: { key, label: key } } });
    const c = await mount();
    expect(steps(c).map((s) => s.firstChild.textContent)).toEqual(STEP_NAMES);
    expect(stepState(c)).toEqual(expected);
  });

  it('shows the order date under Ordered and the due date under Ships, and no other dates', async () => {
    const c = await mount();
    const items = steps(c);
    expect(items[0].textContent).toContain('10/14/2026');
    expect(items[4].textContent).toContain('11/3/2026');
    expect(items.slice(1, 4).map((s) => s.textContent)).toEqual(['In the shop', 'Machining', 'Inspection']);
  });

  it('prefers the ship date over the due date under Ships', async () => {
    getJob.mockResolvedValue({ ok: true, data: { ...JOB, ship_date: '2026-10-28' } });
    const c = await mount();
    expect(steps(c)[4].textContent).toContain('10/28/2026');
    expect(steps(c)[4].textContent).not.toContain('11/3/2026');
  });

  it('shows no dates when the job has none', async () => {
    getJob.mockResolvedValue({ ok: true, data: { ...JOB, po_date: null, due_date: null } });
    const c = await mount();
    expect(steps(c).map((s) => s.textContent)).toEqual(STEP_NAMES);
  });

  it('lists every file in one flat list headed Job files with a count, each with an Open button that downloads', async () => {
    const c = await mount();
    const section = c.querySelector('.portal-job-files');
    expect(section.querySelector('h2').textContent).toBe('Job files \u00b7 4');
    expect(c.querySelector('.portal-file-group')).toBeNull();
    const rows = section.querySelectorAll('.portal-file');
    expect([...rows].map((r) => r.textContent)).toEqual([
      'STEPbrk.stepOpen', 'PDFbrk.pdfOpen', 'PDFother.pdfOpen', 'PDFpin.pdfOpen',
    ]);
    const open = rows[1].querySelector('button');
    expect(open.className).toContain('portal-link');
    await click(open);
    expect(downloadFile).toHaveBeenCalledWith(FILES_11[1]);
  });

  it('says No files yet when no part has files', async () => {
    listPartFiles.mockResolvedValue({ ok: true, data: [] });
    const c = await mount();
    expect(c.querySelector('.portal-job-files').textContent).toContain('No files yet');
    expect(c.querySelector('.portal-job-files h2').textContent).toBe('Job files \u00b7 0');
  });

  it('shows the error when a download fails', async () => {
    downloadFile.mockResolvedValue({ ok: false, error: { kind: 'error', message: 'Could not download' } });
    const c = await mount();
    await click(c.querySelector('.portal-file button'));
    expect(c.querySelector('[role="alert"]').textContent).toContain('Could not download');
  });

  it('shows the job notes inline with a count and the thread', async () => {
    const c = await mount();
    const notes = c.querySelector('.portal-job-notes');
    expect(notes.querySelector('h2').textContent).toBe('Notes on this job \u00b7 2');
    expect(notes.querySelector('.portal-pin')).toBeNull();
    expect([...notes.querySelectorAll('.portal-pin-text')].map((p) => p.textContent)).toEqual(['job note one', 'from Leemac']);
    expect(notes.querySelector('textarea').getAttribute('placeholder')).toBe('Add a note for Leemac\u2026');
  });

  it('sends a note for the job and reloads notes', async () => {
    addNote.mockResolvedValue({ ok: true, data: { id: 9 } });
    const c = await mount();
    const input = c.querySelector('.portal-job-notes textarea');
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
      setter.call(input, 'Hello');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => { c.querySelector('.portal-job-notes form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    await flush();
    expect(addNote).toHaveBeenCalledWith({ job_id: 5 }, 'Hello');
    expect(listNotes).toHaveBeenCalledTimes(2);
  });
});

describe('header actions', () => {
  it('focuses the note field when Add note is clicked', async () => {
    const c = await mount();
    await click(button(c, 'Add note'));
    expect(document.activeElement).toBe(c.querySelector('.portal-job-notes textarea'));
  });

  it('downloads every file across all parts from Download all files', async () => {
    const c = await mount();
    const all = button(c, 'Download all files \u00b7 4');
    expect(all.closest('.portal-job-actions')).not.toBeNull();
    await click(all);
    expect(downloadFile.mock.calls.map((call) => call[0])).toEqual([...FILES_11, ...FILES_12]);
  });

  it('hides Download all files when no part has files, but keeps Add note', async () => {
    listPartFiles.mockResolvedValue({ ok: true, data: [] });
    const c = await mount();
    expect(c.textContent).not.toContain('Download all files');
    expect(button(c, 'Add note')).toBeDefined();
  });

  it('shows the download error when a file fails', async () => {
    downloadFile.mockResolvedValue({ ok: false, error: { kind: 'error', message: 'Could not download' } });
    const c = await mount();
    await click(button(c, 'Download all files \u00b7 4'));
    expect(c.querySelector('[role="alert"]').textContent).toContain('Could not download');
  });
});
