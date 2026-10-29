import React, { act } from 'react';
import { render } from '../../testUtils/render';
import PartList from './PartList';
import { apiFetch } from '../../api/apiFetch';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));
jest.mock('../PartPdfPreview', () => ({ file, drawingCount, fetchUrl, toggleClassName }) =>
  file && drawingCount > 0 ? (
    <button type="button" className={toggleClassName} data-fetch={fetchUrl.name} onClick={(e) => e.stopPropagation()}>
      Click to show preview
    </button>
  ) : null
);

jest.mock('../AdminLayout/AdminLayout', () => ({ children }) => <>{children}</>);
jest.mock('../../api/apiFetch', () => ({ apiFetch: jest.fn() }));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => {
  mockNavigate.mockClear();
  sessionStorage.clear();
  apiFetch.mockResolvedValue({
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    json: async () => [],
  });
});

test('fetches with the saved search and fills the number input', async () => {
  sessionStorage.setItem('adminPartListSearch', JSON.stringify({ number: 'A1' }));
  let view;
  await act(async () => {
    view = render(<PartList />);
  });
  expect(apiFetch).toHaveBeenCalledWith('/internal/part/getparts?number=A1&description=');
  expect(view.container.querySelector('input[placeholder="NUMBER SEARCH"]').value).toBe('A1');
  view.unmount();
});

const PARTS = [
  { id: 1, number: 'A1', description: 'one', drawing_count: 2, latest_drawing: { id: 5 } },
  { id: 2, number: 'B2', description: 'two', drawing_count: 0, latest_drawing: null },
];

const mountWithParts = async () => {
  apiFetch.mockResolvedValue({
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    json: async () => PARTS,
  });
  let view;
  await act(async () => {
    view = render(<PartList />);
  });
  return view;
};

test('shows the preview control only on rows with drawings', async () => {
  const view = await mountWithParts();
  const rows = view.container.querySelectorAll('tbody tr');
  expect(rows[0].textContent).toContain('Click to show preview');
  expect(rows[1].textContent).not.toContain('Click to show preview');
  expect(view.container.querySelectorAll('th')[2].textContent).toBe('Drawing');
  expect(rows[0].querySelector('button').dataset.fetch).toBe('fetchAdminDrawingUrl');
  view.unmount();
});

test('clicking the preview does not navigate but clicking the row does', async () => {
  const view = await mountWithParts();
  const rows = view.container.querySelectorAll('tbody tr');
  await act(async () => { rows[0].querySelector('button').click(); });
  expect(mockNavigate).not.toHaveBeenCalled();
  await act(async () => { rows[0].click(); });
  expect(mockNavigate).toHaveBeenCalledWith('/part/1');
  view.unmount();
});

test('admin preview toggle uses search-button and search controls are unchanged', async () => {
  const view = await mountWithParts();
  const c = view.container;
  expect(c.querySelector('tbody tr button').className).toBe('search-button');
  expect(c.querySelectorAll('input.search-input').length).toBe(2);
  expect([...c.querySelectorAll('.search-container button')].map((b) => b.className)).toEqual([
    'search-button',
    'search-button',
  ]);
  view.unmount();
});
