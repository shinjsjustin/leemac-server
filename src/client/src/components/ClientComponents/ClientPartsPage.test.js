import React, { act } from 'react';
import { render } from '../../testUtils/render';
import ClientPartsPage from './ClientPartsPage';
import { listParts, fetchDrawingUrl } from '../../api/portalApi';
import { usePdfPageImages } from '../PdfImage';
import { listLists, addPartsToList, removePartsFromList } from '../../api/portalListsApi';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));
jest.mock('../../api/portalApi', () => ({ listParts: jest.fn(), fetchDrawingUrl: jest.fn() }));
jest.mock('../../api/portalListsApi', () => ({
  listLists: jest.fn(), createList: jest.fn(), renameList: jest.fn(), deleteList: jest.fn(),
  addPartsToList: jest.fn(), removePartsFromList: jest.fn(),
}));
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
  listLists.mockReset().mockResolvedValue(result([]));
  addPartsToList.mockReset();
  removePartsFromList.mockReset();
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
    type(c.querySelector('input[placeholder="Part number"]'), 'PN');
    type(c.querySelector('input[placeholder="Description"]'), 'Brack');
    expect(listParts).toHaveBeenCalledTimes(1);
    click(c.querySelector('button[aria-label="Search part number"]'));
    await flush();
    expect(listParts).toHaveBeenLastCalledWith({ number: 'PN', description: '' });
    click(c.querySelector('button[aria-label="Search description"]'));
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

  it('renders two search rows with labelled quiet Search buttons', async () => {
    listParts.mockResolvedValue(result([part(1)]));
    const c = await mount();
    const rows = c.querySelectorAll('.portal-search .portal-search-row');
    expect(rows).toHaveLength(2);
    expect([...rows].map((r) => r.querySelector('input').placeholder)).toEqual(['Part number', 'Description']);
    expect([...rows].map((r) => r.querySelector('button').textContent)).toEqual(['Search', 'Search']);
    const buttons = [...rows].map((r) => r.querySelector('button'));
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual(['Search part number', 'Search description']);
    buttons.forEach((b) => expect(b.classList.contains('portal-button--quiet')).toBe(true));
    type(rows[0].querySelector('input'), 'PN');
    click(buttons[0]);
    await flush();
    expect(buttonByText(c, 'Clear').classList.contains('portal-button--quiet')).toBe(true);
  });

  it('applies the search on Enter in either box', async () => {
    listParts.mockResolvedValue(result([part(1)]));
    const c = await mount();
    const enter = (input) => act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    const [num, desc] = c.querySelectorAll('.portal-search .portal-search-row input');
    type(num, 'PN');
    enter(num);
    await flush();
    type(desc, 'Brack');
    enter(desc);
    await flush();
    expect(listParts).toHaveBeenLastCalledWith({ number: 'PN', description: 'Brack' });
    expect(JSON.parse(sessionStorage.getItem('clientPartListSearch'))).toEqual({ number: 'PN', description: 'Brack' });
  });

  it('styles job links and the preview toggle for the portal', async () => {
    listParts.mockResolvedValue(result([part(7, { drawing_count: 1, latest_drawing: DRAWING })]));
    const c = await mount();
    const link = c.querySelector('.portal-card a');
    expect(link.classList.contains('portal-part-job-link')).toBe(true);
    expect(link.classList.contains('portal-link')).toBe(false);
    const toggle = buttonByText(c, 'Click to show preview');
    expect(toggle.classList.contains('portal-button')).toBe(true);
    expect(toggle.classList.contains('portal-button--quiet')).toBe(true);
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
    type(c.querySelector('input[placeholder="Part number"]'), 'zzz');
    click(c.querySelector('button[aria-label="Search part number"]'));
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
    type(c.querySelector('input[placeholder="Part number"]'), value);
    click(c.querySelector('button[aria-label="Search part number"]'));
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

describe('ClientPartsPage lists', () => {
  const list = (id, name, partIds) => ({
    id, name, created_by_name: 'Ann', updated_by_name: 'Ann', part_ids: partIds,
  });
  const sectionTitles = (c) => [...c.querySelectorAll('.portal-parts-section')]
    .map((s) => [s.querySelector('h2').textContent, [...s.querySelectorAll('.portal-part-row strong')].map((n) => n.textContent)]);
  const select = (c, name) => click(buttonByText(c, name));
  const rowFor = (c, n) => [...c.querySelectorAll('.portal-part-row')].find((r) => r.textContent.includes(`PN-${n}`));

  beforeEach(() => {
    listParts.mockResolvedValue(result([part(1), part(2), part(3)]));
    listLists.mockResolvedValue(result([list(5, 'Rush', [3, 1])]));
  });

  it('puts the lists panel before the main column and loads lists on mount', async () => {
    const c = await mount();
    const split = c.querySelector('.portal-parts-split');
    expect([...split.children].map((e) => e.className.split(' ')[0])).toEqual(['portal-lists', 'portal-parts-main']);
    expect(split.querySelector('.portal-parts-main .portal-search')).not.toBeNull();
    expect(listLists).toHaveBeenCalledTimes(1);
  });

  it('shows no sections when no list is selected', async () => {
    const c = await mount();
    expect(c.querySelectorAll('.portal-parts-section')).toHaveLength(0);
    expect(c.querySelectorAll('.portal-part-row')).toHaveLength(3);
  });

  it('moves the list parts into an In section in original order and deselects on second click', async () => {
    const c = await mount();
    select(c, 'Rush');
    expect(sectionTitles(c)).toEqual([['In Rush', ['PN-1', 'PN-3']], ['Other parts', ['PN-2']]]);
    select(c, 'Rush');
    expect(c.querySelectorAll('.portal-parts-section')).toHaveLength(0);
  });

  it('toggles selection on row click instead of navigating, and links the number', async () => {
    const c = await mount();
    select(c, 'Rush');
    const row = rowFor(c, 2);
    click(row);
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(rowFor(c, 2).classList.contains('portal-part-row--selected')).toBe(true);
    const link = row.querySelector('a[href="/client-part/2"]');
    expect(link.textContent).toBe('PN-2');
    link.addEventListener('click', (e) => e.preventDefault());
    click(link);
    expect(rowFor(c, 2).classList.contains('portal-part-row--selected')).toBe(true);
    click(row);
    expect(rowFor(c, 2).classList.contains('portal-part-row--selected')).toBe(false);
  });

  it('shows list action buttons only while parts are selected and clears them', async () => {
    const c = await mount();
    select(c, 'Rush');
    expect(buttonByText(c, 'Add to list')).toBeUndefined();
    click(rowFor(c, 2));
    expect(buttonByText(c, 'Add to list')).toBeDefined();
    expect(buttonByText(c, 'Remove from list')).toBeDefined();
    click(buttonByText(c, 'Clear selected'));
    expect(c.querySelectorAll('.portal-part-row--selected')).toHaveLength(0);
    expect(buttonByText(c, 'Clear selected')).toBeUndefined();
  });

  it('clears the selection when the list changes', async () => {
    const c = await mount();
    select(c, 'Rush');
    click(rowFor(c, 2));
    select(c, 'Rush');
    select(c, 'Rush');
    expect(c.querySelectorAll('.portal-part-row--selected')).toHaveLength(0);
  });

  it('adds selected parts to the list from the response and clears the selection', async () => {
    addPartsToList.mockResolvedValue(result(list(5, 'Rush', [3, 1, 2])));
    const c = await mount();
    select(c, 'Rush');
    click(rowFor(c, 2));
    expect(buttonByText(c, 'Add to list').parentElement.className).toBe('portal-parts-selection');
    expect(buttonByText(c, 'Clear selected').parentElement).toBe(buttonByText(c, 'Add to list').parentElement);
    click(buttonByText(c, 'Add to list'));
    await flush();
    expect(addPartsToList).toHaveBeenCalledWith(5, [2]);
    expect(sectionTitles(c)).toEqual([['In Rush', ['PN-1', 'PN-2', 'PN-3']]]);
    expect(c.querySelectorAll('.portal-part-row--selected')).toHaveLength(0);
  });

  it('removes selected parts from the list from the response and clears the selection', async () => {
    removePartsFromList.mockResolvedValue(result(list(5, 'Rush', [3])));
    const c = await mount();
    select(c, 'Rush');
    click(rowFor(c, 1));
    click(buttonByText(c, 'Remove from list'));
    await flush();
    expect(removePartsFromList).toHaveBeenCalledWith(5, [1]);
    expect(sectionTitles(c)).toEqual([['In Rush', ['PN-3']], ['Other parts', ['PN-1', 'PN-2']]]);
    expect(c.querySelectorAll('.portal-part-row--selected')).toHaveLength(0);
  });

  it('reloads lists, clears selection and says the list was removed on a 404', async () => {
    addPartsToList.mockResolvedValue({ ok: false, error: { kind: 'not_found', message: 'Not found.' } });
    const c = await mount();
    select(c, 'Rush');
    click(rowFor(c, 2));
    listLists.mockResolvedValue(result([]));
    click(buttonByText(c, 'Add to list'));
    await flush();
    expect(listLists).toHaveBeenCalledTimes(2);
    expect(c.textContent).toContain('That list was removed.');
    expect(c.querySelectorAll('.portal-parts-section')).toHaveLength(0);
    expect(buttonByText(c, 'Clear selected')).toBeUndefined();
  });

  it('shows other list errors through PortalMessage and keeps the selection', async () => {
    removePartsFromList.mockResolvedValue({ ok: false, error: { kind: 'invalid', message: 'Too many parts.' } });
    const c = await mount();
    select(c, 'Rush');
    click(rowFor(c, 1));
    click(buttonByText(c, 'Remove from list'));
    await flush();
    expect(c.querySelector('.portal-message[role="alert"]').textContent).toContain('Too many parts.');
    expect(rowFor(c, 1).classList.contains('portal-part-row--selected')).toBe(true);
  });
});
