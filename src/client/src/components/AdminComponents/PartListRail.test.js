import React, { act } from 'react';
import { render } from '../../testUtils/render';
import PartList from './PartList';
import { apiFetch } from '../../api/apiFetch';
import { listLists, createList } from '../../api/adminPartListsApi';

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => jest.fn(),
}));
jest.mock('../PartPdfPreview', () => () => null);
jest.mock('../AdminLayout/AdminLayout', () => ({ children }) => <>{children}</>);
jest.mock('../../api/apiFetch', () => ({ apiFetch: jest.fn() }));
jest.mock('../../api/adminPartListsApi', () => ({ listLists: jest.fn(), createList: jest.fn() }));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const PARTS = [
  { id: 1, number: 'A1', description: 'one', drawing_count: 0, latest_drawing: null },
  { id: 2, number: 'B2', description: 'two', drawing_count: 0, latest_drawing: null },
  { id: 3, number: 'C3', description: 'three', drawing_count: 0, latest_drawing: null },
];
const LISTS = [
  { id: 10, name: 'Brackets', part_ids: [1, 3] },
  { id: 11, name: 'Empty', part_ids: [] },
];

beforeEach(() => {
  sessionStorage.clear();
  apiFetch.mockResolvedValue({
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    json: async () => PARTS,
  });
  listLists.mockReset().mockResolvedValue({ ok: true, data: LISTS });
  createList.mockReset();
});

const mount = async () => {
  let view;
  await act(async () => { view = render(<PartList />); });
  return view;
};
const rowNumbers = (view) =>
  [...view.container.querySelectorAll('tbody tr')].map((r) => r.querySelector('td').textContent);
const railButton = (view, text) =>
  [...view.container.querySelectorAll('.portal-overview-rail button')]
    .find((b) => b.textContent.includes(text));
const click = (el) => act(async () => { el.click(); });
const type = (input, value) => act(async () => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
});

test('shows the rail with All parts, each list with its count, and + New list', async () => {
  const view = await mount();
  const text = view.container.querySelector('.portal-overview-rail').textContent;
  expect(text).toContain('All parts');
  expect(text).toContain('Brackets2 parts');
  expect(text).toContain('Empty0 parts');
  expect(text).toContain('+ New list');
  expect(rowNumbers(view)).toEqual(['A1', 'B2', 'C3']);
  view.unmount();
});

test('picking a list filters parts and All parts restores them', async () => {
  const view = await mount();
  await click(railButton(view, 'Brackets'));
  expect(rowNumbers(view)).toEqual(['A1', 'C3']);
  await click(railButton(view, 'All parts'));
  expect(rowNumbers(view)).toEqual(['A1', 'B2', 'C3']);
  view.unmount();
});

test('creating a list calls createList, reloads lists and closes the name box', async () => {
  createList.mockResolvedValue({ ok: true, data: { id: 12 } });
  const view = await mount();
  await click(railButton(view, '+ New list'));
  await type(view.container.querySelector('input[aria-label="New list name"]'), 'Fresh');
  listLists.mockResolvedValue({ ok: true, data: [...LISTS, { id: 12, name: 'Fresh', part_ids: [] }] });
  await click(railButton(view, 'Create'));
  expect(createList).toHaveBeenCalledWith('Fresh');
  expect(listLists).toHaveBeenCalledTimes(2);
  expect(view.container.querySelector('input[aria-label="New list name"]')).toBeNull();
  expect(railButton(view, 'Fresh')).toBeTruthy();
  view.unmount();
});

test('a failed create shows the server message and keeps the name box open', async () => {
  createList.mockResolvedValue({ ok: false, error: { kind: 'invalid', message: 'Name taken' } });
  const view = await mount();
  await click(railButton(view, '+ New list'));
  await type(view.container.querySelector('input[aria-label="New list name"]'), 'Brackets');
  await click(railButton(view, 'Create'));
  expect(view.container.textContent).toContain('Name taken');
  expect(view.container.querySelector('input[aria-label="New list name"]')).not.toBeNull();
  expect(listLists).toHaveBeenCalledTimes(1);
  view.unmount();
});

test.each([
  ['a failed load', { ok: false, error: { kind: 'error', message: 'x' } }],
  ['a non-array body', { ok: true, data: { lists: [] } }],
])('%s shows no lists and the table still works', async (_n, result) => {
  listLists.mockResolvedValue(result);
  const view = await mount();
  expect(view.container.querySelectorAll('.portal-overview-list').length).toBe(1);
  expect(rowNumbers(view)).toEqual(['A1', 'B2', 'C3']);
  view.unmount();
});

test('drops malformed list entries', async () => {
  listLists.mockResolvedValue({
    ok: true,
    data: [LISTS[0], { id: 5, name: 7, part_ids: [] }, { id: 6, name: 'Bad', part_ids: null }, null],
  });
  const view = await mount();
  expect(view.container.querySelectorAll('.portal-overview-list').length).toBe(2);
  view.unmount();
});
