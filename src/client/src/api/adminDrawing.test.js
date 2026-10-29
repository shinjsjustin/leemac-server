import contracts from './contracts/adminDrawing.json';
import { fetchAdminDrawingUrl } from './adminDrawing';
import { apiFetch } from './apiFetch';

jest.mock('./apiFetch', () => ({ apiFetch: jest.fn() }));

beforeEach(() => {
  apiFetch.mockReset();
  global.URL.createObjectURL = jest.fn(() => 'blob:abc');
});

test('requests the admin blob route and returns an object URL', async () => {
  const blob = {};
  apiFetch.mockResolvedValue({ ok: true, blob: async () => blob });
  const result = await fetchAdminDrawingUrl({ id: 9 });
  expect(apiFetch).toHaveBeenCalledWith('/internal/part/blob/download?fileID=9');
  expect(global.URL.createObjectURL).toHaveBeenCalledWith(blob);
  expect(result).toEqual({ ok: true, url: 'blob:abc' });
});

test('returns an error and creates no object URL on a non-ok response', async () => {
  apiFetch.mockResolvedValue({ ok: false, status: 404 });
  const result = await fetchAdminDrawingUrl({ id: 9 });
  expect(result.ok).toBe(false);
  expect(result.error.kind).toBe('error');
  expect(typeof result.error.message).toBe('string');
  expect(global.URL.createObjectURL).not.toHaveBeenCalled();
});

test('returns an error and creates no object URL when the request throws', async () => {
  apiFetch.mockRejectedValue(new Error('offline'));
  const result = await fetchAdminDrawingUrl({ id: 9 });
  expect(result.ok).toBe(false);
  expect(result.error.kind).toBe('error');
  expect(global.URL.createObjectURL).not.toHaveBeenCalled();
});

test('requests the path and method in the contract fixture', async () => {
  const { args, path, method } = contracts.fetchAdminDrawingUrl;
  apiFetch.mockResolvedValue({ ok: true, blob: async () => ({}) });
  await fetchAdminDrawingUrl(...args);
  expect(method).toBe('GET');
  expect(apiFetch).toHaveBeenCalledWith(path);
});
