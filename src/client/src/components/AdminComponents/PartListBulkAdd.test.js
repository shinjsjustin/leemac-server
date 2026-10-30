import React, { act } from 'react';
import { render } from '../../testUtils/render';
import PartList from './PartList';
import { apiFetch } from '../../api/apiFetch';
import { listLists, addPartsToList } from '../../api/adminPartListsApi';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));
jest.mock('../PartPdfPreview', () => () => null);
jest.mock('../AdminLayout/AdminLayout', () => ({ children }) => <>{children}</>);
jest.mock('../../api/apiFetch', () => ({ apiFetch: jest.fn() }));
jest.mock('../../api/adminPartListsApi', () => ({ listLists: jest.fn(), addPartsToList: jest.fn() }));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const PARTS = [
  { id: 1, number: 'A1', description: 'one', drawing_count: 0, latest_drawing: null },
  { id: 2, number: 'B2', description: 'two', drawing_count: 0, latest_drawing: null },
  { id: 3, number: 'C3', description: 'three', drawing_count: 0, latest_drawing: null },
];
const LISTS = [
  { id: 10, name: 'Brackets', part_ids: [1] },
  { id: 11, name: 'Gears', part_ids: [] },
];

beforeEach(() => {
  sessionStorage.clear();
  mockNavigate.mockReset();
  apiFetch.mockResolvedValue({
    ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => PARTS,
  });
  listLists.mockReset().mockResolvedValue({ ok: true, data: LISTS });
  addPartsToList.mockReset();
});

const mount = async () => {
  let view;
  await act(async () => { view = render(<PartList />); });
  return view;
};
const click = (el) => act(async () => { el.click(); });
const pick = (view, name) => click(
  [...view.container.querySelectorAll('.part-lists-rail button')].find((b) => b.textContent.startsWith(name)),
);
const box = (view, number) => view.container.querySelector(`input[aria-label="Add ${number}"]`);
const confirmButton = (view) => view.container.querySelector('.part-lists-confirm button');
const numbers = (view) =>
  [...view.container.querySelectorAll('tbody tr.table-row')]
    .map((r) => [...r.querySelectorAll('td')].find((td) => td.textContent).textContent);

test('only Other parts rows get a checkbox in a new first column when a list is picked', async () => {
  const view = await mount();
  expect(view.container.querySelectorAll('input[type="checkbox"]')).toHaveLength(0);
  expect(view.container.querySelectorAll('thead th')).toHaveLength(4);
  await pick(view, 'Brackets');
  expect(view.container.querySelectorAll('thead th')).toHaveLength(5);
  expect(box(view, 'A1')).toBeNull();
  expect(box(view, 'B2').closest('td').classList.contains('part-lists-pick')).toBe(true);
  expect(box(view, 'B2').closest('td').cellIndex).toBe(0);
  expect(view.container.querySelectorAll('input[type="checkbox"]')).toHaveLength(2);
  view.unmount();
});

test('ticking a checkbox never navigates, and the confirm button counts ticks', async () => {
  const view = await mount();
  await pick(view, 'Brackets');
  expect(view.container.querySelector('.part-lists-confirm')).toBeNull();
  await click(box(view, 'B2'));
  expect(mockNavigate).not.toHaveBeenCalled();
  expect(confirmButton(view).textContent).toBe('Add 1 parts to Brackets');
  await click(box(view, 'C3').closest('td'));
  await click(box(view, 'C3'));
  expect(mockNavigate).not.toHaveBeenCalled();
  expect(confirmButton(view).textContent).toBe('Add 2 parts to Brackets');
  await click(box(view, 'B2'));
  expect(confirmButton(view).textContent).toBe('Add 1 parts to Brackets');
  await click(box(view, 'C3'));
  expect(view.container.querySelector('.part-lists-confirm')).toBeNull();
  view.unmount();
});

test('clicking add sends the ticked ids once, disables while pending, then moves them into the list', async () => {
  let resolve;
  addPartsToList.mockReturnValue(new Promise((r) => { resolve = r; }));
  const view = await mount();
  await pick(view, 'Brackets');
  await click(box(view, 'B2'));
  await click(box(view, 'C3'));
  await click(confirmButton(view));
  expect(addPartsToList).toHaveBeenCalledTimes(1);
  expect(addPartsToList).toHaveBeenCalledWith(10, [2, 3]);
  expect(confirmButton(view).disabled).toBe(true);
  await click(confirmButton(view));
  expect(addPartsToList).toHaveBeenCalledTimes(1);
  await act(async () => { resolve({ ok: true, data: { id: 10, name: 'Brackets', part_ids: [1, 2, 3] } }); });
  expect(numbers(view)).toEqual(['A1', 'B2', 'C3']);
  expect(view.container.querySelectorAll('tr.part-lists-other')).toHaveLength(0);
  expect(view.container.querySelector('.part-lists-confirm')).toBeNull();
  expect(view.container.querySelector('.part-lists-rail').textContent).toContain('Brackets3 parts');
  view.unmount();
});

test('a failure shows the message and keeps the ticks; the next success clears the message', async () => {
  addPartsToList.mockResolvedValueOnce({ ok: false, error: { kind: 'error', message: 'Server said no' } });
  const view = await mount();
  await pick(view, 'Brackets');
  await click(box(view, 'B2'));
  await click(confirmButton(view));
  expect(view.container.querySelector('.part-lists-confirm [role="alert"]').textContent).toBe('Server said no');
  expect(box(view, 'B2').checked).toBe(true);
  expect(confirmButton(view).disabled).toBe(false);
  addPartsToList.mockResolvedValueOnce({ ok: true, data: { id: 10, name: 'Brackets', part_ids: [1, 2] } });
  await click(confirmButton(view));
  expect(view.container.querySelector('[role="alert"]')).toBeNull();
  expect(box(view, 'B2')).toBeNull();
  view.unmount();
});

test.each([
  ['another list', 'Gears'],
  ['All parts', 'All parts'],
])('picking %s clears the ticks', async (_n, target) => {
  const view = await mount();
  await pick(view, 'Brackets');
  await click(box(view, 'B2'));
  await pick(view, target);
  await pick(view, 'Brackets');
  expect(box(view, 'B2').checked).toBe(false);
  expect(view.container.querySelector('.part-lists-confirm')).toBeNull();
  view.unmount();
});

test('All parts has no checkbox column', async () => {
  const view = await mount();
  await pick(view, 'Brackets');
  await pick(view, 'All parts');
  expect(view.container.querySelectorAll('input[type="checkbox"]')).toHaveLength(0);
  expect(view.container.querySelectorAll('thead th')).toHaveLength(4);
  view.unmount();
});
