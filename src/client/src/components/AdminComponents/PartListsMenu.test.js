import React, { act } from 'react';
import { render } from '../../testUtils/render';
import PartListsMenu from './PartListsMenu';
import PartList from './PartList';
import { apiFetch } from '../../api/apiFetch';
import * as api from '../../api/adminPartListsApi';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));
jest.mock('../PartPdfPreview', () => () => null);
jest.mock('../AdminLayout/AdminLayout', () => ({ children }) => <>{children}</>);
jest.mock('../../api/apiFetch', () => ({ apiFetch: jest.fn() }));
jest.mock('../../api/adminPartListsApi');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const LISTS = [
  { id: 1, name: 'Brackets', part_ids: [7] },
  { id: 2, name: 'Gears', part_ids: [] },
];
const PARTS = [
  { id: 7, number: 'A1', description: 'one', drawing_count: 0, latest_drawing: null },
  { id: 8, number: 'B2', description: 'two', drawing_count: 0, latest_drawing: null },
];
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const click = (el) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
const type = (input, value) => act(() => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
});
const buttonByText = (c, text) => [...c.querySelectorAll('button')].find((b) => b.textContent === text);

let view;
afterEach(() => view && view.unmount());
beforeEach(() => {
  jest.resetAllMocks();
  window.sessionStorage.clear();
});

describe('PartListsMenu', () => {
  const mount = (over = {}) => {
    const rowClick = jest.fn();
    const props = { partId: 7, lists: LISTS, onListChanged: jest.fn(), ...over };
    view = render(<div onClick={rowClick}><PartListsMenu {...props} /></div>);
    return { c: view.container, props, rowClick };
  };
  const boxes = (c) => [...c.querySelectorAll('input[type="checkbox"]')];

  it('opens a checklist ticking the lists that include the part, without reaching the row', () => {
    const { c, rowClick } = mount();
    expect(boxes(c)).toHaveLength(0);
    click(buttonByText(c, 'Lists'));
    expect(boxes(c).map((b) => b.checked)).toEqual([true, false]);
    expect(c.textContent).toContain('Gears');
    expect(rowClick).not.toHaveBeenCalled();
  });

  it('adds the part when ticking and passes the returned list on', async () => {
    const updated = { id: 2, name: 'Gears', part_ids: [7] };
    api.addPartsToList.mockResolvedValue({ ok: true, data: updated });
    const { c, props, rowClick } = mount();
    click(buttonByText(c, 'Lists'));
    click(boxes(c)[1]);
    await flush();
    expect(api.addPartsToList).toHaveBeenCalledWith(2, [7]);
    expect(props.onListChanged).toHaveBeenCalledWith(updated);
    expect(rowClick).not.toHaveBeenCalled();
  });

  it('removes the part when unticking', async () => {
    const updated = { id: 1, name: 'Brackets', part_ids: [] };
    api.removePartsFromList.mockResolvedValue({ ok: true, data: updated });
    const { c, props } = mount();
    click(buttonByText(c, 'Lists'));
    click(boxes(c)[0]);
    await flush();
    expect(api.removePartsFromList).toHaveBeenCalledWith(1, [7]);
    expect(props.onListChanged).toHaveBeenCalledWith(updated);
  });

  it('shows the error message and does not change lists on failure', async () => {
    api.addPartsToList.mockResolvedValue({ ok: false, error: { kind: 'error', message: 'Nope' } });
    const { c, props } = mount();
    click(buttonByText(c, 'Lists'));
    click(boxes(c)[1]);
    await flush();
    expect(c.textContent).toContain('Nope');
    expect(props.onListChanged).not.toHaveBeenCalled();
  });
});

describe('PartList lists integration', () => {
  const mountPage = async () => {
    apiFetch.mockResolvedValue({
      ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => PARTS,
    });
    api.listLists.mockResolvedValue({ ok: true, data: LISTS });
    await act(async () => { view = render(<PartList />); });
    return view.container;
  };
  const railButton = (c, name) =>
    [...c.querySelectorAll('.part-lists-rail button')].find((b) => b.textContent.startsWith(name));

  it('has a Lists header and a Lists button per row, opening without navigating', async () => {
    const c = await mountPage();
    const heads = [...c.querySelectorAll('th')].map((t) => t.textContent);
    expect(heads[heads.length - 1]).toBe('Lists');
    const rowButtons = c.querySelectorAll('tbody tr:first-child button');
    click(rowButtons[rowButtons.length - 1]);
    expect(c.querySelectorAll('tbody tr:first-child input[type="checkbox"]')).toHaveLength(2);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('replaces the changed list so the filter reflects it', async () => {
    api.addPartsToList.mockResolvedValue({ ok: true, data: { id: 2, name: 'Gears', part_ids: [8] } });
    const c = await mountPage();
    click(c.querySelectorAll('tbody tr:nth-child(2) button')[0]);
    click(c.querySelectorAll('tbody tr:nth-child(2) input[type="checkbox"]')[1]);
    await flush();
    click(railButton(c, 'Gears'));
    expect([...c.querySelectorAll('tbody tr')].map((r) => r.textContent)).toEqual([
      expect.stringContaining('B2'),
      'Other parts',
      expect.stringContaining('A1'),
    ]);
  });

  it('shows no manage bar until a list is picked, then renames through renameList', async () => {
    api.renameList.mockResolvedValue({ ok: true, data: { id: 2, name: 'Cogs', part_ids: [] } });
    const c = await mountPage();
    expect(buttonByText(c, 'Rename')).toBeUndefined();
    click(railButton(c, 'Gears'));
    click(buttonByText(c, 'Rename'));
    type(c.querySelector('.part-lists-bar input'), 'Cogs');
    click(buttonByText(c, 'Save'));
    await flush();
    expect(api.renameList).toHaveBeenCalledWith(2, 'Cogs');
    expect(c.querySelector('.part-lists-bar').textContent).toContain('Cogs');
  });

  it('shows the rename failure message', async () => {
    api.renameList.mockResolvedValue({ ok: false, error: { kind: 'invalid', message: 'Name taken' } });
    const c = await mountPage();
    click(railButton(c, 'Gears'));
    click(buttonByText(c, 'Rename'));
    type(c.querySelector('.part-lists-bar input'), 'Brackets');
    click(buttonByText(c, 'Save'));
    await flush();
    expect(c.textContent).toContain('Name taken');
  });

  it('deletes only after Confirm, then reloads and returns to All parts', async () => {
    api.deleteList.mockResolvedValue({ ok: true, data: {} });
    const c = await mountPage();
    click(railButton(c, 'Gears'));
    expect([...c.querySelectorAll('tbody tr')].map((r) => r.className)).toEqual([
      'part-lists-empty', 'part-lists-divider', 'table-row part-lists-other', 'table-row part-lists-other',
    ]);
    click(buttonByText(c, 'Delete'));
    expect(api.deleteList).not.toHaveBeenCalled();
    api.listLists.mockResolvedValue({ ok: true, data: [LISTS[0]] });
    click(buttonByText(c, 'Confirm'));
    await flush();
    expect(api.deleteList).toHaveBeenCalledWith(2);
    expect(c.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(buttonByText(c, 'Rename')).toBeUndefined();
  });

  it('shows the delete failure message and stays on the list', async () => {
    api.deleteList.mockResolvedValue({ ok: false, error: { kind: 'error', message: 'Cannot delete' } });
    const c = await mountPage();
    click(railButton(c, 'Gears'));
    click(buttonByText(c, 'Delete'));
    click(buttonByText(c, 'Confirm'));
    await flush();
    expect(c.textContent).toContain('Cannot delete');
    expect(buttonByText(c, 'Rename')).toBeDefined();
  });
});
