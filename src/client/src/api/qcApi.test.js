import contracts from './contracts/qcApi.json';
import * as api from './qcApi';

const respond = (status, body, headers = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (name) => headers[name] ?? null },
  json: async () => body,
  blob: async () => 'blob-data',
});

beforeEach(() => {
  localStorage.clear();
  global.fetch = jest.fn();
  global.URL.createObjectURL = jest.fn(() => 'blob:photo');
});

const entries = Object.entries(contracts);

describe('qcApi contract fixture', () => {
  test.each(entries)('%s sends its fixture request', async (name, entry) => {
    global.fetch.mockResolvedValue(respond(200, {}));
    await api[name](...entry.args);
    const [url, init] = global.fetch.mock.calls[0];
    expect(url.endsWith(entry.path)).toBe(true);
    expect(init.method).toBe(entry.method);
    expect(init.body === undefined ? null : JSON.parse(init.body)).toEqual(entry.body);
  });
});

describe('JSON calls', () => {
  test('return data on success', async () => {
    global.fetch.mockResolvedValue(respond(200, { markings: [], photos: [] }));
    expect(await api.getPartQc(1)).toEqual({ ok: true, data: { markings: [], photos: [] } });
  });

  test('401 drops the token', async () => {
    localStorage.setItem('token', 'abc');
    global.fetch.mockResolvedValue(respond(401, {}));
    const result = await api.getPartQc(1);
    expect(result.error.kind).toBe('signed_out');
    expect(localStorage.getItem('token')).toBeNull();
  });

  test('400 returns the server error message', async () => {
    global.fetch.mockResolvedValue(respond(400, { error: 'size must be 1-40' }));
    expect(await api.addMarking(1, {})).toEqual({
      ok: false,
      error: { kind: 'invalid', message: 'size must be 1-40' },
    });
  });

  test('network failure resolves to the generic error', async () => {
    global.fetch.mockRejectedValue(new TypeError('offline'));
    expect(await api.pingLeemac(1)).toEqual({
      ok: false,
      error: { kind: 'error', message: 'Something went wrong. Please try again.' },
    });
  });
});

describe('fetchPhotoUrl', () => {
  test('returns an object URL for the photo blob', async () => {
    global.fetch.mockResolvedValue(respond(200, {}));
    expect(await api.fetchPhotoUrl(1)).toEqual({ ok: true, url: 'blob:photo' });
    expect(global.URL.createObjectURL).toHaveBeenCalledWith('blob-data');
  });

  test('404 resolves to not_found and creates no object URL', async () => {
    global.fetch.mockResolvedValue(respond(404, {}));
    const result = await api.fetchPhotoUrl(1);
    expect(result.error.kind).toBe('not_found');
    expect(global.URL.createObjectURL).not.toHaveBeenCalled();
  });

  test('network failure resolves to the generic error', async () => {
    global.fetch.mockRejectedValue(new TypeError('offline'));
    const result = await api.fetchPhotoUrl(1);
    expect(result).toEqual({ ok: false, error: { kind: 'error', message: 'Something went wrong. Please try again.' } });
  });
});
