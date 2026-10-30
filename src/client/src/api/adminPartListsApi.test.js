import contracts from './contracts/adminPartListsApi.json';
import {
  listLists, createList, renameList, deleteList, addPartsToList,
  removePartsFromList,
} from './adminPartListsApi';

const respond = (status, body, headers = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (name) => headers[name] ?? null },
  json: async () => body,
});

beforeEach(() => {
  localStorage.clear();
  global.fetch = jest.fn();
});

describe('calls', () => {
  test.each([
    ['listLists', () => listLists(), 'GET', /\/internal\/part-lists$/, undefined],
    ['createList', () => createList('Brackets'), 'POST', /\/internal\/part-lists$/, '{"name":"Brackets"}'],
    ['renameList', () => renameList('a/b', 'New'), 'PUT', /\/internal\/part-lists\/a%2Fb$/, '{"name":"New"}'],
    ['deleteList', () => deleteList(4), 'DELETE', /\/internal\/part-lists\/4$/, undefined],
    ['addPartsToList', () => addPartsToList(4, [1, 2]), 'POST', /\/internal\/part-lists\/4\/parts$/, '{"part_ids":[1,2]}'],
    ['removePartsFromList', () => removePartsFromList(4, [3]), 'POST', /\/internal\/part-lists\/4\/parts\/remove$/, '{"part_ids":[3]}'],
  ])('%s uses the right method, path and body and returns data', async (_name, call, method, path, body) => {
    global.fetch.mockResolvedValue(respond(200, { id: 4 }));
    const result = await call();
    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toMatch(path);
    expect(init.method).toBe(method);
    expect(init.body).toBe(body);
    expect(result).toEqual({ ok: true, data: { id: 4 } });
  });
});

describe('errors', () => {
  test.each([400, 409])('%i carries the server error text as invalid', async (status) => {
    global.fetch.mockResolvedValue(respond(status, { error: 'Too big' }));
    expect(await deleteList(1)).toEqual({ ok: false, error: { kind: 'invalid', message: 'Too big' } });
  });

  test('400 without error text falls back to a generic sentence', async () => {
    global.fetch.mockResolvedValue({ ...respond(400, null), json: async () => { throw new Error('bad'); } });
    const result = await createList('x');
    expect(result.error.kind).toBe('invalid');
    expect(result.error.message).toBeTruthy();
  });

  test.each([401, 404, 429])('%i is a generic error', async (status) => {
    global.fetch.mockResolvedValue(respond(status, { error: 'secret' }));
    expect(await listLists()).toEqual({
      ok: false,
      error: { kind: 'error', message: 'Something went wrong. Please try again.' },
    });
  });

  test('500 is a generic error', async () => {
    global.fetch.mockResolvedValue(respond(500, { error: 'secret' }));
    const result = await listLists();
    expect(result.error.kind).toBe('error');
    expect(result.error.message).not.toMatch(/secret/);
  });

  test('network failure is an error kind', async () => {
    global.fetch.mockRejectedValue(new TypeError('offline'));
    const result = await listLists();
    expect(result.ok).toBe(false);
    expect(result.error.kind).toBe('error');
  });
});

describe('adminPartListsApi contract fixture', () => {
  const entries = Object.entries(contracts).flatMap(([name, value]) => [].concat(value).map((entry) => [name, entry]));
  const fns = { listLists, createList, renameList, deleteList, addPartsToList, removePartsFromList };

  test.each(entries.map(([name, entry]) => [`${name} ${JSON.stringify(entry.body)}`, name, entry]))(
    'sends %s',
    async (_label, name, entry) => {
      global.fetch.mockResolvedValue({ ...respond(200, {}), blob: async () => 'blob-data' });
      global.URL.createObjectURL = jest.fn(() => 'blob:r');
      await fns[name](...entry.args);
      const [url, init] = global.fetch.mock.calls[0];
      expect(url.endsWith(entry.path)).toBe(true);
      expect(init.method).toBe(entry.method);
      expect(init.body === undefined ? null : JSON.parse(init.body)).toEqual(entry.body);
    }
  );
});
