import React, { act } from 'react';
import { render } from '../../testUtils/render';
import ClientPartsPage from './ClientPartsPage';
import { listParts, fetchDrawingUrl } from '../../api/portalApi';
import { usePdfPageImages } from '../PdfImage';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));
jest.mock('../../api/portalApi', () => ({ listParts: jest.fn(), fetchDrawingUrl: jest.fn() }));
jest.mock('../PdfImage', () => ({ usePdfPageImages: jest.fn() }));

global.IS_REACT_ACT_ENVIRONMENT = true;

const DRAWING = { id: 31, filename: 'brk.pdf', mimetype: 'application/pdf' };
const jobs = (n) => Array.from({ length: n }, (_, i) => ({ id: 100 + i, job_number: `J-${i + 1}` }));
const part = (id, over = {}) => ({
  part_id: id,
  part_number: `PN-${id}`,
  part_description: `Bracket ${id}`,
  jobs: jobs(1),
  drawing_count: 0,
  latest_drawing: null,
  ...over,
});
const result = (data) => ({ ok: true, data });
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const type = (input, value) => act(() => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
});
const click = (el) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
const buttonByText = (c, text) => [...c.querySelectorAll('button')].find((b) => b.textContent === text);

let view;
const mount = async () => {
  view = render(<ClientPartsPage />);
  await flush();
  return view.container;
};

beforeEach(() => {
  sessionStorage.clear();
  mockNavigate.mockClear();
  listParts.mockReset();
  fetchDrawingUrl.mockReset().mockReturnValue(new Promise(() => {}));
  usePdfPageImages.mockReturnValue({ images: [], failed: false });
});
afterEach(() => view && view.unmount());

describe('ClientPartsPage', () => {
  it('renders the titled layout, back link and one row per part with job links', async () => {
    listParts.mockResolvedValue(result([part(1, { jobs: jobs(2) }), part(2)]));
    const c = await mount();
    expect(c.querySelector('.portal-shell h1').textContent).toBe('Your parts');
    const back = [...c.querySelectorAll('a')].find((a) => a.textContent === 'Back to your jobs');
    expect(back.getAttribute('href')).toBe('/client-home');
    const rows = c.querySelectorAll('.portal-card');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('PN-1');
    expect(rows[0].textContent).toContain('Bracket 1');
    const links = [...rows[0].querySelectorAll('a')].map((a) => [a.textContent, a.getAttribute('href')]);
    expect(links).toEqual([['J-1', '/client-job/100'], ['J-2', '/client-job/101']]);
  });

  it('shows 3 job links and a "+2 more" button that reveals the rest', async () => {
    listParts.mockResolvedValue(result([part(1, { jobs: jobs(5) })]));
    const c = await mount();
    const row = c.querySelector('.portal-card');
    expect([...row.querySelectorAll('a')].map((a) => a.textContent)).toEqual(['J-1', 'J-2', 'J-3']);
    click(buttonByText(row, '+2 more'));
    expect([...row.querySelectorAll('a')].map((a) => a.textContent)).toEqual(['J-1', 'J-2', 'J-3', 'J-4', 'J-5']);
    expect(buttonByText(row, '+2 more')).toBeUndefined();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('searches with the applied number and description and remembers them across remounts', async () => {
    listParts.mockResolvedValue(result([part(1)]));
    let c = await mount();
    expect(listParts).toHaveBeenLastCalledWith({ number: '', description: '' });
    type(c.querySelector('input[placeholder="NUMBER SEARCH"]'), 'PN');
    type(c.querySelector('input[placeholder="DESCRIPTION SEARCH"]'), 'Brack');
    expect(listParts).toHaveBeenCalledTimes(1);
    click(buttonByText(c, 'Search Number'));
    await flush();
    expect(listParts).toHaveBeenLastCalledWith({ number: 'PN', description: '' });
    click(buttonByText(c, 'Search Desc'));
    await flush();
    expect(listParts).toHaveBeenLastCalledWith({ number: 'PN', description: 'Brack' });
    expect(JSON.parse(sessionStorage.getItem('clientPartListSearch'))).toEqual({ number: 'PN', description: 'Brack' });

    view.unmount();
    c = await mount();
    expect(listParts).toHaveBeenLastCalledWith({ number: 'PN', description: 'Brack' });

    click(buttonByText(c, 'Clear'));
    await flush();
    expect(listParts).toHaveBeenLastCalledWith({ number: '', description: '' });
  });

  it('navigates on row click but not on job link or preview clicks', async () => {
    listParts.mockResolvedValue(result([part(7, { drawing_count: 1, latest_drawing: DRAWING })]));
    const c = await mount();
    const row = c.querySelector('.portal-card');
    const link = row.querySelector('a');
    link.addEventListener('click', (e) => e.preventDefault());
    click(link);
    click(buttonByText(row, 'Click to show preview'));
    expect(mockNavigate).not.toHaveBeenCalled();
    click(row.querySelector('strong'));
    expect(mockNavigate).toHaveBeenCalledWith('/client-part/7');
  });

  it('shows loading, error and empty states with PortalMessage and no prices', async () => {
    let resolve;
    listParts.mockReturnValue(new Promise((r) => { resolve = r; }));
    view = render(<ClientPartsPage />);
    expect(view.container.querySelector('.portal-message h2').textContent).toBe('Loading');
    await act(async () => resolve({ ok: false, error: { kind: 'error', message: 'Boom' } }));
    expect(view.container.querySelector('.portal-message[role="alert"]').textContent).toContain('Boom');
    view.unmount();

    listParts.mockResolvedValue(result([]));
    let c = await mount();
    expect(c.querySelector('.portal-message').textContent).toContain("You don't have any parts with us yet.");
    type(c.querySelector('input[placeholder="NUMBER SEARCH"]'), 'zzz');
    click(buttonByText(c, 'Search Number'));
    await flush();
    expect(c.querySelector('.portal-message').textContent).toContain('No parts match your search.');
    view.unmount();

    listParts.mockResolvedValue(result([part(1)]));
    sessionStorage.clear();
    c = await mount();
    expect(c.textContent).not.toMatch(/price|\$/i);
  });

  const failure = { ok: false, error: { kind: 'error', message: 'Boom' } };
  const searchFor = (c, value) => {
    type(c.querySelector('input[placeholder="NUMBER SEARCH"]'), value);
    click(buttonByText(c, 'Search Number'));
  };

  it('shows Loading and no error while a search is pending after a failed load', async () => {
    listParts.mockResolvedValueOnce(failure);
    const c = await mount();
    expect(c.querySelector('[role="alert"]')).not.toBeNull();
    listParts.mockReturnValueOnce(new Promise(() => {}));
    searchFor(c, 'PN');
    expect(c.querySelector('.portal-message h2').textContent).toBe('Loading');
    expect(c.querySelector('[role="alert"]')).toBeNull();
  });

  it('drops the previous rows when a search fails after a successful list', async () => {
    listParts.mockResolvedValueOnce(result([part(1), part(2)]));
    const c = await mount();
    expect(c.querySelectorAll('.portal-part-row')).toHaveLength(2);
    listParts.mockResolvedValueOnce(failure);
    searchFor(c, 'PN');
    await flush();
    expect(c.querySelector('[role="alert"]').textContent).toContain('Boom');
    expect(c.querySelectorAll('.portal-part-row')).toHaveLength(0);
  });

  it('shows the new rows and no error when a search succeeds after a failure', async () => {
    listParts.mockResolvedValueOnce(failure);
    const c = await mount();
    listParts.mockResolvedValueOnce(result([part(3)]));
    searchFor(c, 'PN');
    await flush();
    expect(c.querySelector('[role="alert"]')).toBeNull();
    expect(c.querySelectorAll('.portal-part-row')).toHaveLength(1);
    expect(c.textContent).toContain('PN-3');
  });
});
