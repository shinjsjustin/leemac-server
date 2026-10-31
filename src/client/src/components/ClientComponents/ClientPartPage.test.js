const fs = require('fs');
const path = require('path');
import React, { act } from 'react';
import { render } from '../../testUtils/render';
import ClientPartPage from './ClientPartPage';
import { getPart, formatDate } from '../../api/portalApi';

jest.mock('../../api/portalApi', () => ({
  ...jest.requireActual('../../api/portalApi'),
  getPart: jest.fn(),
}));

jest.mock('./PortalDrawing', () => ({
  __esModule: true,
  default: ({ file, size }) => <div className={`drawing-stub drawing-stub--${size}`}>{file.filename}</div>,
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

let view;
const mount = async () => {
  view = render(<ClientPartPage />, { path: '/client-part/7', route: '/client-part/:id' });
  await flush();
  return view.container;
};

afterEach(() => view && view.unmount());
beforeEach(() => getPart.mockReset());

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

  it('renders each drawing large in the given order', async () => {
    getPart.mockResolvedValue({ ok: true, data: PART });
    const c = await mount();
    const grid = c.querySelector('.portal-drawings.portal-drawings--large');
    expect([...grid.querySelectorAll('.drawing-stub--large')].map((d) => d.textContent)).toEqual(['new.pdf', 'old.pdf']);
    expect(c.textContent).not.toContain('No drawing');
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
