import React, { act } from 'react';
import { render } from '../../testUtils/render';
import ClientPartPage from './ClientPartPage';
import { getPart } from '../../api/portalApi';

jest.mock('../../api/portalApi', () => ({
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
  jobs: [
    { id: 9, job_number: 'J-9' },
    { id: 4, job_number: 'J-4' },
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

  it('lists each job as a link to its job page in the given order', async () => {
    getPart.mockResolvedValue({ ok: true, data: PART });
    const c = await mount();
    const links = [...c.querySelectorAll('a')].filter((a) => /^\/client-job\//.test(a.getAttribute('href')));
    expect(links.map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['J-9', '/client-job/9'],
      ['J-4', '/client-job/4'],
    ]);
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
