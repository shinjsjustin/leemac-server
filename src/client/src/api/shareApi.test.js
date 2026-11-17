import contracts from './contracts/shareApi.json';
import * as api from './shareApi';

const respond = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  blob: async () => 'blob-data',
});

const BLOB_CALLS = ['fetchSharedQuotePdfUrl', 'fetchSharedDrawingUrl', 'fetchSharedPhotoUrl'];
const JSON_CALLS = ['openSharedQuote', 'openSharedQc'];

beforeEach(() => {
  localStorage.clear();
  global.fetch = jest.fn();
  URL.createObjectURL = jest.fn(() => 'blob:made');
});

describe('shareApi contract fixture', () => {
  test.each(Object.entries(contracts))('%s sends its fixture request', async (name, entry) => {
    global.fetch.mockResolvedValue(respond(200, {}));
    await api[name](...entry.args);
    const [url, init] = global.fetch.mock.calls[0];
    expect(url.endsWith(entry.path)).toBe(true);
    expect(init.method).toBe(entry.method);
    expect(JSON.parse(init.body)).toEqual(entry.body);
  });

  test.each(Object.entries(contracts))('%s keeps the token out of the url', async (name, entry) => {
    global.fetch.mockResolvedValue(respond(200, {}));
    await api[name](...entry.args);
    expect(global.fetch.mock.calls[0][0]).not.toContain(entry.args[0]);
  });
});

describe('results', () => {
  test.each(JSON_CALLS)('%s returns data on success', async (name) => {
    global.fetch.mockResolvedValue(respond(200, { parts: [] }));
    expect(await api[name](...contracts[name].args)).toEqual({ ok: true, data: { parts: [] } });
  });

  test.each(BLOB_CALLS)('%s resolves a blob url', async (name) => {
    global.fetch.mockResolvedValue(respond(200, null));
    expect(await api[name](...contracts[name].args)).toEqual({ ok: true, url: 'blob:made' });
    expect(URL.createObjectURL).toHaveBeenCalledWith('blob-data');
  });

  test.each([...JSON_CALLS, ...BLOB_CALLS])('%s resolves a 404 to not_found', async (name) => {
    global.fetch.mockResolvedValue(respond(404, { error: 'Not found' }));
    const result = await api[name](...contracts[name].args);
    expect(result.ok).toBe(false);
    expect(result.error.kind).toBe('not_found');
  });

  test.each([...JSON_CALLS, ...BLOB_CALLS])('%s resolves a network failure instead of throwing', async (name) => {
    global.fetch.mockRejectedValue(new TypeError('offline'));
    const result = await api[name](...contracts[name].args);
    expect(result).toEqual({ ok: false, error: { kind: 'error', message: 'Something went wrong. Please try again.' } });
  });
});
