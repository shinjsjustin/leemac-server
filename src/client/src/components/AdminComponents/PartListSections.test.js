import React, { act } from 'react';
import { render } from '../../testUtils/render';
import PartList from './PartList';
import { apiFetch } from '../../api/apiFetch';
import { listLists } from '../../api/adminPartListsApi';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));
jest.mock('../PartPdfPreview', () => () => null);
jest.mock('../AdminLayout/AdminLayout', () => ({ children }) => <>{children}</>);
jest.mock('../../api/apiFetch', () => ({ apiFetch: jest.fn() }));
jest.mock('../../api/adminPartListsApi', () => ({ listLists: jest.fn() }));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const PARTS = [
  { id: 1, number: 'A1', description: 'one', drawing_count: 0, latest_drawing: null },
  { id: 2, number: 'B2', description: 'two', drawing_count: 0, latest_drawing: null },
  { id: 3, number: 'C3', description: 'three', drawing_count: 0, latest_drawing: null },
  { id: 4, number: 'D4', description: 'four', drawing_count: 0, latest_drawing: null },
];
const LISTS = [
  { id: 10, name: 'Brackets', part_ids: [3, 1] },
  { id: 11, name: 'Empty', part_ids: [] },
];

beforeEach(() => {
  sessionStorage.clear();
  mockNavigate.mockReset();
  apiFetch.mockResolvedValue({
    ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => PARTS,
  });
  listLists.mockReset().mockResolvedValue({ ok: true, data: LISTS });
});

const mount = async () => {
  let view;
  await act(async () => { view = render(<PartList />); });
  return view;
};
const pick = (view, name) => act(async () => {
  [...view.container.querySelectorAll('.part-lists-rail button')]
    .find((b) => b.textContent.startsWith(name)).click();
});
const rows = (view) => [...view.container.querySelectorAll('tbody tr')];
const labels = (view) => rows(view).map((r) => (r.querySelector('td') || r.querySelector('th')).textContent);

test('a picked list shows its parts, an Other parts row, then the remaining parts in fetched order', async () => {
  const view = await mount();
  await pick(view, 'Brackets');
  expect(labels(view)).toEqual(['A1', 'C3', 'Other parts', 'B2', 'D4']);
  expect(view.container.querySelector('.part-lists-empty')).toBeNull();
  const divider = view.container.querySelector('tr.part-lists-divider');
  expect(divider.children).toHaveLength(1);
  expect(divider.querySelector('th').colSpan).toBe(4);
  expect(rows(view).map((r) => r.classList.contains('part-lists-other'))).toEqual([false, false, false, true, true]);
  view.unmount();
});

test('a picked list with no parts shows the empty row above the Other parts row', async () => {
  const view = await mount();
  await pick(view, 'Empty');
  expect(labels(view)).toEqual(['No parts in this list yet', 'Other parts', 'A1', 'B2', 'C3', 'D4']);
  expect(rows(view)[0].classList.contains('part-lists-empty')).toBe(true);
  view.unmount();
});

test('All parts shows every part with no divider or empty row', async () => {
  const view = await mount();
  await pick(view, 'Brackets');
  await pick(view, 'All parts');
  expect(labels(view)).toEqual(['A1', 'B2', 'C3', 'D4']);
  expect(view.container.querySelector('.part-lists-divider')).toBeNull();
  view.unmount();
});

test('divider and empty rows never navigate; part rows in both sections do', async () => {
  const view = await mount();
  await pick(view, 'Empty');
  const click = (el) => act(async () => { el.click(); });
  await click(view.container.querySelector('.part-lists-empty'));
  await click(view.container.querySelector('.part-lists-divider th'));
  expect(mockNavigate).not.toHaveBeenCalled();
  await click(view.container.querySelector('tr.part-lists-other td'));
  expect(mockNavigate).toHaveBeenCalledWith('/part/1');
  await pick(view, 'Brackets');
  await click(rows(view)[0].querySelector('td'));
  expect(mockNavigate).toHaveBeenLastCalledWith('/part/1');
  expect([...rows(view)[3].querySelectorAll('button')].some((b) => b.textContent === 'Lists')).toBe(true);
  view.unmount();
});
