import contracts from './contracts/portalListsApi.json';
import {
  listLists, createList, renameList, deleteList, addPartsToList,
  removePartsFromList, getRequestLines, requestFromList,
  previewSharedList, joinSharedList, listSharedLists, getSharedList, renameSharedList,
  addPartsToSharedList, removePartsFromSharedList, leaveSharedList, getSharedRequestLines, requestFromSharedList,
} from './portalListsApi';

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
    ['listLists', () => listLists(), 'GET', /\/portal-lists$/, undefined],
    ['createList', () => createList('Brackets'), 'POST', /\/portal-lists$/, '{"name":"Brackets"}'],
    ['renameList', () => renameList('a/b', 'New'), 'PUT', /\/portal-lists\/a%2Fb$/, '{"name":"New"}'],
    ['deleteList', () => deleteList(4), 'DELETE', /\/portal-lists\/4$/, undefined],
    ['addPartsToList', () => addPartsToList(4, [1, 2]), 'POST', /\/portal-lists\/4\/parts$/, '{"part_ids":[1,2]}'],
    ['removePartsFromList', () => removePartsFromList(4, [3]), 'POST', /\/portal-lists\/4\/parts\/remove$/, '{"part_ids":[3]}'],
    ['getRequestLines', () => getRequestLines(4), 'GET', /\/portal-lists\/4\/request-lines$/, undefined],
    ['requestFromList', () => requestFromList(4, { title: 'x' }), 'POST', /\/portal-lists\/4\/request$/, '{"title":"x"}'],
    ['previewSharedList', () => previewSharedList('tok'), 'POST', /\/portal-lists\/shared\/invite$/, '{"token":"tok"}'],
    ['joinSharedList', () => joinSharedList('tok'), 'POST', /\/portal-lists\/shared\/invite\/join$/, '{"token":"tok"}'],
    ['listSharedLists', () => listSharedLists(), 'GET', /\/portal-lists\/shared$/, undefined],
    ['getSharedList', () => getSharedList(4), 'GET', /\/portal-lists\/shared\/4$/, undefined],
    ['renameSharedList', () => renameSharedList('a/b', 'New'), 'PUT', /\/portal-lists\/shared\/a%2Fb$/, '{"name":"New"}'],
    ['addPartsToSharedList', () => addPartsToSharedList(4, [1, 2]), 'POST', /\/portal-lists\/shared\/4\/parts$/, '{"part_ids":[1,2]}'],
    ['removePartsFromSharedList', () => removePartsFromSharedList(4, [3]), 'POST', /\/portal-lists\/shared\/4\/parts\/remove$/, '{"part_ids":[3]}'],
    ['leaveSharedList', () => leaveSharedList(4), 'POST', /\/portal-lists\/shared\/4\/leave$/, undefined],
    ['getSharedRequestLines', () => getSharedRequestLines(4), 'GET', /\/portal-lists\/shared\/4\/request-lines$/, undefined],
    ['requestFromSharedList', () => requestFromSharedList(4, { title: 'x' }), 'POST', /\/portal-lists\/shared\/4\/request$/, '{"title":"x"}'],
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
  test.each([400, 409, 413])('%i carries the server error text as invalid', async (status) => {
    global.fetch.mockResolvedValue(respond(status, { error: 'Too big' }));
    expect(await getRequestLines(1)).toEqual({ ok: false, error: { kind: 'invalid', message: 'Too big' } });
  });

  test('400 without error text falls back to a generic sentence', async () => {
    global.fetch.mockResolvedValue({ ...respond(400, null), json: async () => { throw new Error('bad'); } });
    const result = await createList('x');
    expect(result.error.kind).toBe('invalid');
    expect(result.error.message).toBeTruthy();
  });

  test('401 signs out and drops the token', async () => {
    localStorage.setItem('token', 'abc');
    global.fetch.mockResolvedValue(respond(401, {}));
    const result = await listLists();
    expect(result.error.kind).toBe('signed_out');
    expect(localStorage.getItem('token')).toBeNull();
  });

  test('404 is not_found', async () => {
    global.fetch.mockResolvedValue(respond(404, {}));
    expect((await deleteList(1)).error.kind).toBe('not_found');
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

test('the share token never appears in a request path', async () => {
  global.fetch.mockResolvedValue(respond(200, {}));
  await previewSharedList('secret-token');
  await joinSharedList('secret-token');
  for (const [url] of global.fetch.mock.calls) expect(url).not.toContain('secret-token');
});

describe('portalListsApi contract fixture', () => {
  const entries = Object.entries(contracts).flatMap(([name, value]) => [].concat(value).map((entry) => [name, entry]));
  const fns = {
    listLists, createList, renameList, deleteList, addPartsToList, removePartsFromList, getRequestLines, requestFromList,
    previewSharedList, joinSharedList, listSharedLists, getSharedList, renameSharedList, addPartsToSharedList,
    removePartsFromSharedList, leaveSharedList, getSharedRequestLines, requestFromSharedList,
  };

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
