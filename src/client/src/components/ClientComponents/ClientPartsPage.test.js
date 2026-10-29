import React, { act } from 'react';
import { render } from '../../testUtils/render';
import ClientPartsPage from './ClientPartsPage';
import { listParts, fetchDrawingUrl } from '../../api/portalApi';
import { listNotes } from '../../api/portalNotesApi';
import { listLists, createList, deleteList, addPartsToList, removePartsFromList } from '../../api/portalListsApi';
import ListRequestForm from './ListRequestForm';

const mockNavigate = jest.fn();
let mockParams;
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
  useSearchParams: () => [mockParams],
}));
jest.mock('../../api/portalApi', () => ({
  listParts: jest.fn(), fetchDrawingUrl: jest.fn(), formatDate: () => '10/29/2026',
}));
jest.mock('../../api/portalNotesApi', () => ({ listNotes: jest.fn(), addNote: jest.fn() }));
jest.mock('../../api/portalListsApi', () => ({
  listLists: jest.fn(), createList: jest.fn(), renameList: jest.fn(), deleteList: jest.fn(),
  addPartsToList: jest.fn(), removePartsFromList: jest.fn(),
}));
jest.mock('./ListRequestForm', () => jest.fn(() => null));
jest.mock('./DrawingTile', () => ({ file }) => <div className="stub-tile">{file && file.filename}</div>);

global.IS_REACT_ACT_ENVIRONMENT = true;

const DRAWING = { id: 31, filename: 'brk.pdf', mimetype: 'application/pdf' };
const part = (id, over = {}) => ({
  part_id: id,
  part_number: `PN-${id}`,
  part_description: `Bracket ${id}`,
  latest_drawing: DRAWING,
  latest: {
    rev: 'B', stage: { key: 'machining', label: 'Machining' }, job_number: `J-${id}`,
    material: '6061', finish: 'Anodize', quantity: 10 + id,
  },
  ...over,
});
const list = (id, name, partIds) => ({
  id, name, created_by_name: 'Ann', updated_by_name: 'Ann', part_ids: partIds,
});
const result = (data) => ({ ok: true, data });
const failure = { ok: false, error: { kind: 'error', message: 'Boom' } };
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const type = (input, value) => act(() => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
});
const change = (select, value) => act(() => {
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, value);
  select.dispatchEvent(new Event('change', { bubbles: true }));
});
const click = (el) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
const buttonByText = (c, text) => [...c.querySelectorAll('button')].find((b) => b.textContent === text);
const card = (c, n) => [...c.querySelectorAll('.portal-part-card')].find((e) => e.textContent.includes(`PN-${n}`));
const check = (c, n) => c.querySelector(`input[aria-label="Select PN-${n}"]`);
const railRow = (c, n) => [...c.querySelectorAll('.portal-rail-row')].find((e) => e.textContent.includes(`PN-${n}`));
const selbar = (c) => c.querySelector('.portal-parts-selection');

let view;
let isPhone;
const mount = async () => {
  view = render(<ClientPartsPage />);
  await flush();
  return view.container;
};

beforeEach(() => {
  isPhone = false;
  window.matchMedia = jest.fn((query) => ({ matches: isPhone && query === '(max-width: 599px)' }));
  sessionStorage.clear();
  mockNavigate.mockClear();
  listParts.mockReset().mockResolvedValue(result([part(1), part(2), part(3)]));
  listLists.mockReset().mockResolvedValue(result([list(5, 'Rush', [3, 1])]));
  listNotes.mockReset().mockResolvedValue(result({ jobs: {}, parts: {} }));
  mockParams = new URLSearchParams();
  createList.mockReset();
  deleteList.mockReset();
  addPartsToList.mockReset();
  removePartsFromList.mockReset();
  ListRequestForm.mockReset().mockImplementation(({ list: l }) => <div className="stub-request-form">{`Form ${l.name}`}</div>);
  fetchDrawingUrl.mockReset().mockReturnValue(new Promise(() => {}));
});
afterEach(() => view && view.unmount());

describe('ClientPartsPage wall and toolbar', () => {
  it('loads parts, lists and notes and shows a card per part with the rail beside it', async () => {
    const c = await mount();
    expect([...c.querySelectorAll('a')].some((a) => a.textContent === 'Back to your jobs')).toBe(false);
    expect(c.querySelectorAll('.portal-part-card')).toHaveLength(3);
    expect(c.querySelectorAll('.portal-rail-list .portal-rail-row')).toHaveLength(2);
    expect(listLists).toHaveBeenCalledTimes(1);
    expect(listNotes).toHaveBeenCalledTimes(1);
  });

  it('shows the rail tabs with list and part counts and the job number on rail rows', async () => {
    const c = await mount();
    expect([...c.querySelectorAll('.portal-rail [role="tab"]')].map((t) => t.textContent)).toEqual(['Lists 1', 'All parts 3']);
    expect(railRow(c, 1).querySelector('.portal-rail-job').textContent).toBe('J-1');
  });

  it('switches between Drawings cards and a Table', async () => {
    const c = await mount();
    expect(buttonByText(c, 'Drawings').getAttribute('aria-pressed')).toBe('true');
    click(buttonByText(c, 'Table'));
    expect(c.querySelectorAll('.portal-part-card')).toHaveLength(0);
    expect(c.querySelectorAll('.portal-part-row')).toHaveLength(3);
    click(buttonByText(c, 'Drawings'));
    expect(c.querySelectorAll('.portal-part-card')).toHaveLength(3);
  });

  it('shows the Parts title with the loaded count and calls listParts once with no arguments', async () => {
    const c = await mount();
    expect(c.querySelector('h1').textContent).toBe('Parts');
    expect(c.querySelector('.portal-parts-count').textContent).toBe('3');
    expect(listParts).toHaveBeenCalledTimes(1);
    expect(listParts).toHaveBeenCalledWith();
  });

  it('puts search, material and toggle in one toolbar row', async () => {
    const c = await mount();
    const bar = c.querySelector('.portal-parts-toolbar.portal-search-row');
    expect(bar.querySelector('input[aria-label="Search parts"]')).not.toBeNull();
    expect(bar.querySelector('select[aria-label="Material"]')).not.toBeNull();
    expect(bar.querySelector('button[aria-pressed]')).not.toBeNull();
    expect(bar.querySelectorAll('input')).toHaveLength(1);
  });

  it('filters cards by number, description, material or any job number, ignoring case', async () => {
    listParts.mockResolvedValue(result([
      part(1, { part_number: 'AB-100' }),
      part(2, { part_description: 'Flanged Hub' }),
      part(3, { latest: { ...part(3).latest, material: 'Titanium' } }),
      part(4, { jobs: [{ id: 9, job_number: 'OLD-77' }] }),
    ]));
    const c = await mount();
    const search = c.querySelector('input[aria-label="Search parts"]');
    const shown = () => [...c.querySelectorAll('.portal-part-card')].map((e) => e.textContent.match(/PN-\d|AB-100/)[0]);
    type(search, 'ab-1');
    expect(shown()).toEqual(['AB-100']);
    type(search, 'FLANGED');
    expect(shown()).toEqual(['PN-2']);
    type(search, 'titan');
    expect(shown()).toEqual(['PN-3']);
    type(search, 'old-77');
    expect(shown()).toEqual(['PN-4']);
    expect(listParts).toHaveBeenCalledTimes(1);
  });

  it('narrows by Material select listing each distinct material', async () => {
    listParts.mockResolvedValue(result([
      part(1), part(2, { latest: { ...part(2).latest, material: 'Brass' } }), part(3),
    ]));
    const c = await mount();
    const select = c.querySelector('select[aria-label="Material"]');
    expect([...select.options].map((o) => o.textContent)).toEqual(['All materials', '6061', 'Brass']);
    change(select, 'Brass');
    expect(c.querySelectorAll('.portal-part-card')).toHaveLength(1);
    expect(card(c, 2)).toBeDefined();
  });

  it('toggles On a job now with a count, excluding finished stages', async () => {
    const stage = (key) => ({ key, label: key });
    listParts.mockResolvedValue(result([
      part(1),
      part(2, { latest: { ...part(2).latest, stage: stage('shipped') } }),
      part(3, { latest: { ...part(3).latest, stage: stage('done') } }),
      part(4, { latest: { ...part(4).latest, stage: null } }),
    ]));
    const c = await mount();
    const toggleBtn = buttonByText(c, 'On a job now · 1');
    expect(toggleBtn.getAttribute('aria-pressed')).toBe('false');
    click(toggleBtn);
    expect(toggleBtn.getAttribute('aria-pressed')).toBe('true');
    expect(c.querySelectorAll('.portal-part-card')).toHaveLength(1);
    expect(card(c, 1)).toBeDefined();
  });

  it('shows the no-match message when filters exclude everything', async () => {
    const c = await mount();
    type(c.querySelector('input[aria-label="Search parts"]'), 'zzz');
    expect(c.querySelector('.portal-message').textContent).toContain('No parts match your search.');
    expect(c.querySelectorAll('.portal-part-card')).toHaveLength(0);
  });

  it('shows loading, error and empty messages', async () => {
    let resolve;
    listParts.mockReturnValue(new Promise((r) => { resolve = r; }));
    view = render(<ClientPartsPage />);
    expect(view.container.querySelector('.portal-message h2').textContent).toBe('Loading');
    await act(async () => resolve(failure));
    expect(view.container.querySelector('.portal-message[role="alert"]').textContent).toContain('Boom');
    expect(view.container.querySelectorAll('.portal-part-card')).toHaveLength(0);
    view.unmount();

    listParts.mockResolvedValue(result([]));
    const c = await mount();
    expect(c.querySelector('.portal-message').textContent).toContain("You don't have any parts with us yet.");
  });
});

describe('ClientPartsPage windows', () => {
  it('opens a window with the latest facts on card click and numbers the card and rail row', async () => {
    const c = await mount();
    click(card(c, 2));
    const win = c.querySelector('.portal-window');
    expect(win.textContent).toContain('PN-2');
    expect(win.textContent).toContain('Rev B');
    expect(win.textContent).toContain('Bracket 2');
    expect(win.textContent).toContain('job J-2');
    expect(win.textContent).toContain('6061');
    expect(win.textContent).toContain('Anodize');
    expect(win.textContent).toContain('12');
    expect(win.textContent).toContain('brk.pdf');
    expect(c.querySelector('.portal-windows-backdrop--railed')).not.toBeNull();
    expect(card(c, 2).querySelector('.portal-part-marker').textContent).toBe('1');
    expect(railRow(c, 2).querySelector('.portal-rail-num').textContent).toBe('1');
  });

  it('opens from a table row and a rail row, numbering in open order', async () => {
    const c = await mount();
    click(buttonByText(c, 'Table'));
    click([...c.querySelectorAll('.portal-part-row')].find((e) => e.textContent.includes('PN-3')));
    click(railRow(c, 1));
    expect(c.querySelectorAll('.portal-window')).toHaveLength(2);
    expect(railRow(c, 3).querySelector('.portal-rail-num').textContent).toBe('1');
    expect(railRow(c, 1).querySelector('.portal-rail-num').textContent).toBe('2');
  });

  it('does not open a second window for the same part', async () => {
    const c = await mount();
    click(card(c, 2));
    click(railRow(c, 2));
    expect(c.querySelectorAll('.portal-window')).toHaveLength(1);
  });
});

describe('ClientPartsPage selection bar', () => {
  const menuButton = (c) => buttonByText(selbar(c), 'Add to list ▾');
  const menuItems = (c) => [...c.querySelectorAll('.portal-parts-selection [role="menuitem"]')];
  const choose = (c, name) => { click(menuButton(c)); click(menuItems(c).find((i) => i.textContent === name)); };

  it('shows the count, Clear, the menu button and Request a quote only while parts are checked, with no select', async () => {
    const c = await mount();
    expect(selbar(c)).toBeNull();
    click(check(c, 2));
    expect(selbar(c).textContent).toContain('1 part selected');
    click(check(c, 1));
    expect(selbar(c).textContent).toContain('2 parts selected');
    expect(menuButton(c)).toBeDefined();
    expect(buttonByText(selbar(c), 'Request a quote')).toBeDefined();
    expect(selbar(c).querySelector('select')).toBeNull();
    expect(mockNavigate).not.toHaveBeenCalled();
    click(buttonByText(selbar(c), 'Clear'));
    expect(selbar(c)).toBeNull();
    expect(check(c, 2).checked).toBe(false);
  });

  it('opens a menu with one menuitem per list and reflects it in aria-expanded', async () => {
    listLists.mockResolvedValue(result([list(5, 'Rush', [3, 1]), list(6, 'Later', [])]));
    const c = await mount();
    click(check(c, 2));
    expect(menuButton(c).getAttribute('aria-haspopup')).toBe('menu');
    expect(menuButton(c).getAttribute('aria-expanded')).toBe('false');
    expect(c.querySelector('[role="menu"]')).toBeNull();
    click(menuButton(c));
    expect(menuButton(c).getAttribute('aria-expanded')).toBe('true');
    expect(menuItems(c).map((i) => i.textContent)).toEqual(['Rush', 'Later']);
    click(menuButton(c));
    expect(c.querySelector('[role="menu"]')).toBeNull();
  });

  it('adds only the parts not yet on the picked list and clears the selection', async () => {
    addPartsToList.mockResolvedValue(result(list(5, 'Rush', [3, 1, 2])));
    const c = await mount();
    click(check(c, 2));
    click(check(c, 1));
    choose(c, 'Rush');
    await flush();
    expect(addPartsToList).toHaveBeenCalledWith(5, [2]);
    expect(removePartsFromList).not.toHaveBeenCalled();
    expect(selbar(c)).toBeNull();
    expect(c.querySelectorAll('.portal-rail-list .portal-rail-row')).toHaveLength(3);
  });

  it('removes the checked parts when every one is on the picked list, then clears the selection', async () => {
    removePartsFromList.mockResolvedValue(result(list(5, 'Rush', [3])));
    const c = await mount();
    click(check(c, 1));
    choose(c, 'Rush');
    await flush();
    expect(removePartsFromList).toHaveBeenCalledWith(5, [1]);
    expect(addPartsToList).not.toHaveBeenCalled();
    expect(c.querySelectorAll('.portal-rail-list .portal-rail-row')).toHaveLength(1);
    expect(selbar(c)).toBeNull();
  });

  it('keeps the selection and shows the error when a list write fails', async () => {
    addPartsToList.mockResolvedValue({ ok: false, error: { kind: 'invalid', message: 'Too many parts.' } });
    const c = await mount();
    click(check(c, 2));
    choose(c, 'Rush');
    await flush();
    expect(c.querySelector('.portal-message[role="alert"]').textContent).toContain('Too many parts.');
    expect(check(c, 2).checked).toBe(true);
  });

  it('reloads lists and says the list was removed on a 404', async () => {
    addPartsToList.mockResolvedValue({ ok: false, error: { kind: 'not_found', message: 'Not found.' } });
    const c = await mount();
    click(check(c, 2));
    listLists.mockResolvedValue(result([]));
    choose(c, 'Rush');
    await flush();
    expect(listLists).toHaveBeenCalledTimes(2);
    expect(c.textContent).toContain('That list was removed.');
    expect(selbar(c)).toBeNull();
  });

  it('Request a quote creates a dated list, adds the checked ids, reloads lists, then shows the form', async () => {
    const calls = [];
    createList.mockImplementation(async (name) => { calls.push(['create', name]); return result(list(9, name, [])); });
    addPartsToList.mockImplementation(async (id, ids) => { calls.push(['add', id, ids]); return result(list(9, 'Q', ids)); });
    const c = await mount();
    listLists.mockImplementation(async () => {
      calls.push(['reload']);
      return result([list(5, 'Rush', [3, 1]), list(9, 'Quote request 10/29/2026', [2, 1])]);
    });
    click(check(c, 2));
    click(check(c, 1));
    click(buttonByText(selbar(c), 'Request a quote'));
    await flush();
    expect(calls).toEqual([
      ['create', 'Quote request 10/29/2026'], ['add', 9, [2, 1]], ['reload'],
    ]);
    expect(c.querySelector('.stub-request-form').textContent).toBe('Form Quote request 10/29/2026');
    expect(selbar(c)).toBeNull();
  });

  it('keeps the selection and adds nothing when createList fails', async () => {
    createList.mockResolvedValue(failure);
    const c = await mount();
    click(check(c, 2));
    click(buttonByText(selbar(c), 'Request a quote'));
    await flush();
    expect(addPartsToList).not.toHaveBeenCalled();
    expect(c.querySelector('.stub-request-form')).toBeNull();
    expect(check(c, 2).checked).toBe(true);
    expect(c.querySelector('.portal-message[role="alert"]').textContent).toContain('Boom');
  });

  it('deletes the new empty list and keeps the selection when adding parts fails', async () => {
    createList.mockResolvedValue(result(list(9, 'Quote request 10/29/2026', [])));
    addPartsToList.mockResolvedValue(failure);
    deleteList.mockResolvedValue(result({}));
    const c = await mount();
    click(check(c, 2));
    click(buttonByText(selbar(c), 'Request a quote'));
    await flush();
    expect(deleteList).toHaveBeenCalledWith(9);
    expect(listLists).toHaveBeenCalledTimes(2);
    expect(c.querySelector('.stub-request-form')).toBeNull();
    expect(check(c, 2).checked).toBe(true);
    expect(c.querySelector('.portal-message[role="alert"]').textContent).toContain('Boom');
  });
});

describe('ClientPartsPage request param', () => {
  it('shows the form for ?request=<listId> once lists load', async () => {
    mockParams = new URLSearchParams('request=5');
    const c = await mount();
    expect(c.querySelector('.stub-request-form').textContent).toBe('Form Rush');
  });

  it('shows the wall when the requested list does not exist', async () => {
    mockParams = new URLSearchParams('request=77');
    const c = await mount();
    expect(c.querySelector('.stub-request-form')).toBeNull();
    expect(c.querySelectorAll('.portal-part-card')).toHaveLength(3);
  });
});

describe('ClientPartsPage request mode', () => {
  const formProps = () => ListRequestForm.mock.calls[ListRequestForm.mock.calls.length - 1][0];
  const requestFrom = (c) => click(buttonByText(c, 'Request'));

  it('shows the form for the list in place of the wall', async () => {
    const c = await mount();
    requestFrom(c);
    expect(c.querySelector('.stub-request-form').textContent).toBe('Form Rush');
    expect(formProps().list.id).toBe(5);
    expect(c.querySelectorAll('.portal-part-card')).toHaveLength(0);
  });

  it('navigates to client requests on submit', async () => {
    const c = await mount();
    requestFrom(c);
    act(() => formProps().onSubmitted());
    expect(mockNavigate).toHaveBeenCalledWith('/client-requests');
  });

  it('returns to the wall on cancel', async () => {
    const c = await mount();
    requestFrom(c);
    act(() => formProps().onCancel());
    expect(c.querySelector('.stub-request-form')).toBeNull();
    expect(c.querySelectorAll('.portal-part-card')).toHaveLength(3);
  });

  it('on gone reloads lists and says the list was removed', async () => {
    const c = await mount();
    requestFrom(c);
    listLists.mockResolvedValue(result([]));
    await act(async () => { await formProps().onGone(); });
    expect(c.querySelector('.stub-request-form')).toBeNull();
    expect(listLists).toHaveBeenCalledTimes(2);
    expect(c.textContent).toContain('That list was removed.');
  });

  it('closes request mode when the requesting list is deleted', async () => {
    deleteList.mockResolvedValue(result({}));
    const c = await mount();
    requestFrom(c);
    click(buttonByText(c, 'Edit'));
    click(buttonByText(c, 'Delete'));
    click(buttonByText(c, 'Delete list'));
    await flush();
    expect(deleteList).toHaveBeenCalledWith(5);
    expect(c.querySelector('.stub-request-form')).toBeNull();
  });
});

describe('ClientPartsPage phone', () => {
  it('shows both the wall and the rail above 600px with no switch', async () => {
    const c = await mount();
    expect(buttonByText(c, 'Lists')).toBeUndefined();
    expect(buttonByText(c, 'Table')).toBeDefined();
    expect(c.querySelector('.portal-parts-grid')).not.toBeNull();
    expect(c.querySelector('.portal-rail')).not.toBeNull();
  });

  it('puts the Parts | Lists switch in the title row and drops the Drawings | Table switch', async () => {
    isPhone = true;
    const c = await mount();
    expect(c.querySelector('.portal-title-row').contains(buttonByText(c, 'Lists'))).toBe(true);
    expect(buttonByText(c, 'Table')).toBeUndefined();
    expect(buttonByText(c, 'Drawings')).toBeUndefined();
  });

  it('shows the wall or the rail, not both, under 600px', async () => {
    isPhone = true;
    const c = await mount();
    expect(c.querySelector('.portal-parts-grid')).not.toBeNull();
    expect(c.querySelector('.portal-rail')).toBeNull();
    click(buttonByText(c, 'Lists'));
    expect(c.querySelector('.portal-parts-grid')).toBeNull();
    expect(c.querySelector('.portal-rail')).not.toBeNull();
    click(buttonByText(c, 'Parts'));
    expect(c.querySelector('.portal-parts-grid')).not.toBeNull();
    expect(c.querySelector('.portal-rail')).toBeNull();
  });

  it('returns to the Parts side to show the request form', async () => {
    isPhone = true;
    const c = await mount();
    click(buttonByText(c, 'Lists'));
    click(buttonByText(c, 'Request'));
    expect(c.querySelector('.stub-request-form')).not.toBeNull();
  });
});
