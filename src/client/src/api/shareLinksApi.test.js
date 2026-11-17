import contracts from './contracts/shareLinksApi.json';
import * as api from './shareLinksApi';

const respond = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

beforeEach(() => {
  localStorage.clear();
  global.fetch = jest.fn();
});

const GENERIC = { ok: false, error: { kind: 'error', message: 'Something went wrong. Please try again.' } };

describe('shareLinksApi contract fixture', () => {
  test.each(Object.entries(contracts))('%s sends its fixture request', async (name, entry) => {
    global.fetch.mockResolvedValue(respond(200, {}));
    await api[entry.fn || name](...entry.args);
    const [url, init] = global.fetch.mock.calls[0];
    expect(url.endsWith(entry.path)).toBe(true);
    expect(init.method).toBe(entry.method);
    expect(init.body === undefined ? null : JSON.parse(init.body)).toEqual(entry.body);
  });
});

describe('results', () => {
  test('return data on success', async () => {
    global.fetch.mockResolvedValue(respond(200, { link: null, ready: true }));
    expect(await api.getShareLink('quote', 12)).toEqual({ ok: true, data: { link: null, ready: true } });
  });

  test.each([400, 403, 409])('%i returns the server error message', async (status) => {
    global.fetch.mockResolvedValue(respond(status, { error: 'nope' }));
    expect(await api.createShareLink('quote', 12)).toEqual({ ok: false, error: { kind: 'invalid', message: 'nope' } });
  });

  test('a 400 with no message falls back to the generic message', async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 400, json: async () => { throw new Error('bad'); } });
    expect(await api.turnOffShareLink(1)).toEqual({
      ok: false,
      error: { kind: 'invalid', message: GENERIC.error.message },
    });
  });

  test.each([404, 500])('a %i resolves to the generic error', async (status) => {
    global.fetch.mockResolvedValue(respond(status, { error: 'boom' }));
    expect(await api.listShareCompanies(1)).toEqual(GENERIC);
  });

  test('network failure resolves to the generic error', async () => {
    global.fetch.mockRejectedValue(new TypeError('offline'));
    expect(await api.getShareLink('qc', 1, 10)).toEqual(GENERIC);
  });
});
