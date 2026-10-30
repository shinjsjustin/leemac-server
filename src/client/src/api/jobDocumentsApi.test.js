import contracts from './contracts/jobDocumentsApi.json';
import { listDocuments, makeDocument } from './jobDocumentsApi';

const GENERIC = 'Something went wrong. Please try again.';

const respond = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: () => null },
  json: async () => body,
});

const api = { listDocuments, makeDocument };

beforeEach(() => {
  localStorage.clear();
  global.fetch = jest.fn();
});

describe('contract fixtures', () => {
  test.each(Object.entries(contracts))('%s sends its fixture', async (name, { args, method, path }) => {
    global.fetch.mockResolvedValue(respond(200, []));
    const result = await api[name](...args);
    const [url, init] = global.fetch.mock.calls[0];
    expect(url.endsWith(path)).toBe(true);
    expect(init.method).toBe(method);
    expect(init.body).toBeUndefined();
    expect(result.ok).toBe(true);
  });
});

describe('results', () => {
  test('returns the parsed body as data', async () => {
    global.fetch.mockResolvedValue(respond(201, { id: 80 }));
    expect(await makeDocument(7, 'quote')).toEqual({ ok: true, data: { id: 80 } });
  });

  test('carries the server error text on a refusal', async () => {
    global.fetch.mockResolvedValue(respond(409, { error: 'Job has no lines' }));
    expect(await makeDocument(7, 'quote')).toEqual({ ok: false, error: { message: 'Job has no lines' } });
  });

  test('uses a generic message when the error body is unreadable', async () => {
    global.fetch.mockResolvedValue({ ...respond(500, null), json: async () => { throw new Error('bad'); } });
    expect(await listDocuments(7)).toEqual({ ok: false, error: { message: GENERIC } });
  });

  test('does not throw when the network fails', async () => {
    global.fetch.mockRejectedValue(new Error('offline'));
    expect(await listDocuments(7)).toEqual({ ok: false, error: { message: GENERIC } });
  });

  test('encodes the job id and type in the query', async () => {
    global.fetch.mockResolvedValue(respond(201, {}));
    await makeDocument('a&b', 'packing list');
    expect(global.fetch.mock.calls[0][0].endsWith('/internal/job/documents/make?id=a%26b&type=packing%20list')).toBe(true);
  });
});
