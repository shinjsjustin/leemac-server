const fs = require('fs');
const path = require('path');
import React, { act } from 'react';
import { render } from '../../testUtils/render';
import ClientPartPage from './ClientPartPage';
import { getPart, formatDate } from '../../api/portalApi';
import { getPartQc } from '../../api/qcApi';

jest.mock('../../api/portalApi', () => ({
  ...jest.requireActual('../../api/portalApi'),
  getPart: jest.fn(),
}));

jest.mock('../../api/qcApi', () => ({ getPartQc: jest.fn() }));

jest.mock('./QcDrawing', () => ({
  __esModule: true,
  default: ({ file, partId, markings }) => (
    <div className="drawing-stub" data-part={partId} data-markings={markings.map((m) => m.id).join(',')}>{file.filename}</div>
  ),
}));

jest.mock('./PortalDrawing', () => ({
  __esModule: true,
  NoDrawing: ({ size }) => <div className={`portal-drawing-empty portal-drawing--${size}`}>No drawing</div>,
}));

jest.mock('../PdfImage', () => ({ usePdfPageImages: () => ({ images: [], failed: false }) }));

global.IS_REACT_ACT_ENVIRONMENT = true;

const PART = {
  part_id: 7,
  part_number: 'BRK-100',
  part_description: 'Steel bracket',
  facts: { rev: 'B', material: '6061 Aluminum', finish: 'Anodize' },
  jobs: [
    { id: 9, job_number: 'J-9', quantity: 10, po_date: '2026-03-05' },
    { id: 4, job_number: 'J-4', quantity: 25, po_date: '2025-12-01' },
  ],
  drawings: [
    { id: 52, filename: 'new.pdf' },
    { id: 51, filename: 'old.pdf' },
  ],
};

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

// The nav renders once per breakpoint, so de-duplicate by href.
const currentTabs = (c) => [...new Set([...c.querySelectorAll('nav a[aria-current="page"]')].map((a) => a.getAttribute('href')))];

let view;
const mount = async (search = '') => {
  view = render(<ClientPartPage />, { path: `/client-part/7${search}`, route: '/client-part/:id' });
  await flush();
  return view.container;
};

afterEach(() => view && view.unmount());
const QC = { markings: [{ id: 5, file_id: 52 }, { id: 6, file_id: 51 }], photos: [] };
beforeEach(() => {
  getPart.mockReset();
  getPartQc.mockReset();
  getPartQc.mockResolvedValue({ ok: true, data: QC });
});

describe('ClientPartPage', () => {
  it('calls getPart with the route id and shows the number and description', async () => {
    getPart.mockResolvedValue({ ok: true, data: PART });
    const c = await mount();
    expect(getPart).toHaveBeenCalledWith('7');
    expect(c.querySelector('h1').textContent).toBe('BRK-100');
    expect(c.textContent).toContain('Steel bracket');
  });

  it('links back to the parts list', async () => {
    getPart.mockResolvedValue({ ok: true, data: PART });
    const c = await mount();
    const back = [...c.querySelectorAll('a')].find((a) => a.textContent === 'Back to parts');
    expect(back.getAttribute('href')).toBe('/client-parts');
  });

  it('links back to the job and keeps Your jobs current when opened from a job', async () => {
    getPart.mockResolvedValue({ ok: true, data: PART });
    const c = await mount('?job=7');
    const back = [...c.querySelectorAll('a')].find((a) => a.textContent === 'Back to job');
    expect(back.getAttribute('href')).toBe('/client-job/7');
    expect([...c.querySelectorAll('a')].some((a) => a.textContent === 'Back to parts')).toBe(false);
    expect(currentTabs(c)).toEqual(['/client-home']);
  });

  it.each(['?job=abc', '?job=0', '?job=-3', '?job=1.5', '?job='])('keeps Back to parts for an invalid job query %s', async (search) => {
    getPart.mockResolvedValue({ ok: true, data: PART });
    const c = await mount(search);
    const back = [...c.querySelectorAll('a')].find((a) => a.textContent === 'Back to parts');
    expect(back.getAttribute('href')).toBe('/client-parts');
    expect(currentTabs(c)).toEqual(['/client-parts']);
  });

  it('lists past orders as a table with Job, Date, Qty headings and linked job numbers', async () => {
    getPart.mockResolvedValue({ ok: true, data: PART });
    const c = await mount();
    expect(c.textContent).toContain('Past orders');
    expect([...c.querySelectorAll('table th')].map((h) => h.textContent)).toEqual(['Job', 'Date', 'Qty']);
    const rows = [...c.querySelectorAll('table tbody tr')];
    expect(rows.map((r) => [...r.querySelectorAll('td')].map((td) => td.textContent))).toEqual([
      ['J-9', formatDate('2026-03-05'), '10'],
      ['J-4', formatDate('2025-12-01'), '25'],
    ]);
    expect(rows.map((r) => r.querySelector('a').getAttribute('href'))).toEqual(['/client-job/9', '/client-job/4']);
  });

  it('leaves a missing date or quantity as an empty cell without a dash', async () => {
    const jobs = [{ id: 3, job_number: 'J-3', quantity: null, po_date: null }];
    getPart.mockResolvedValue({ ok: true, data: { ...PART, jobs } });
    const c = await mount();
    const cells = [...c.querySelectorAll('table tbody tr td')].map((td) => td.textContent);
    expect(cells).toEqual(['J-3', '', '']);
    expect(c.textContent).not.toContain('—');
  });

  it('shows Rev, Material and Finish from facts', async () => {
    getPart.mockResolvedValue({ ok: true, data: PART });
    const c = await mount();
    const facts = c.querySelector('.portal-part-facts');
    expect(facts.textContent).toBe('RevBMaterial6061 AluminumFinishAnodize');
  });

  it('hides null facts', async () => {
    const facts = { rev: null, material: '6061 Aluminum', finish: null };
    getPart.mockResolvedValue({ ok: true, data: { ...PART, facts } });
    const c = await mount();
    expect(c.querySelector('.portal-part-facts').textContent).toBe('Material6061 Aluminum');
  });

  it('renders no facts row when facts is missing', async () => {
    const { facts, ...rest } = PART;
    getPart.mockResolvedValue({ ok: true, data: rest });
    const c = await mount();
    expect(c.querySelector('.portal-part-facts')).toBeNull();
  });

  it('renders drawings before past orders', async () => {
    getPart.mockResolvedValue({ ok: true, data: PART });
    const c = await mount();
    const drawings = c.querySelector('.portal-drawings--large');
    const table = c.querySelector('table');
    expect(drawings.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('lays large drawings out one per row at full width', () => {
    const css = fs.readFileSync(path.join(__dirname, '../Styling/ClientPortal.css'), 'utf8');
    const m = /\.portal-shell \.portal-drawings--large\s*\{([^}]*)\}/.exec(css);
    expect(m[1].replace(/\s+/g, ' ')).toContain('grid-template-columns: 1fr;');
  });

  it('renders each drawing as a QC drawing in the given order with the part markings', async () => {
    getPart.mockResolvedValue({ ok: true, data: PART });
    const c = await mount();
    expect(getPartQc).toHaveBeenCalledWith('7');
    const grid = c.querySelector('.portal-drawings.portal-drawings--large');
    const stubs = [...grid.querySelectorAll('.drawing-stub')];
    expect(stubs.map((d) => d.textContent)).toEqual(['new.pdf', 'old.pdf']);
    expect(stubs.map((d) => [d.dataset.part, d.dataset.markings])).toEqual([['7', '5,6'], ['7', '5,6']]);
    expect(c.textContent).not.toContain('No drawing');
  });

  it('still shows the drawings, without markings, when the QC load fails', async () => {
    getPart.mockResolvedValue({ ok: true, data: PART });
    getPartQc.mockResolvedValue({ ok: false, error: { kind: 'busy', message: 'busy' } });
    const c = await mount();
    expect([...c.querySelectorAll('.drawing-stub')].map((d) => d.dataset.markings)).toEqual(['', '']);
  });

  it('shows No drawing when the part has no drawings', async () => {
    getPart.mockResolvedValue({ ok: true, data: { ...PART, drawings: [] } });
    const c = await mount();
    expect(c.querySelector('.portal-drawings--large .portal-drawing--large').textContent).toBe('No drawing');
  });

  it('shows a not-found message for a 404', async () => {
    getPart.mockResolvedValue({ ok: false, error: { kind: 'not_found', message: 'Not found.' } });
    const c = await mount();
    expect(c.textContent).toContain("We couldn't find that part.");
    expect(c.querySelector('h1')).not.toBeNull();
    expect(c.querySelector('.portal-message h2').textContent).toBe("We couldn't find that part");
    expect(c.textContent).not.toContain('that job');
  });

  it('shows the error message for other failures', async () => {
    getPart.mockResolvedValue({ ok: false, error: { kind: 'busy', message: 'Too many requests. Try again in 1 minute.' } });
    const c = await mount();
    expect(c.textContent).toContain('We are a little busy');
  });

  it('shows a loading message before the part arrives', async () => {
    getPart.mockReturnValue(new Promise(() => {}));
    const c = await mount();
    expect(c.textContent).toContain('Loading');
  });
});
