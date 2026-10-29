import {
  listRequests, getRequest, createRequest, saveRequest, submitRequest,
  uploadRequestFiles, uploadLineFiles, removeRequestFile, requestStatusLabel, formatLocalDate,
} from './portalRequestsApi';

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
    ['listRequests', () => listRequests(), 'GET', /\/portal-requests$/],
    ['getRequest', () => getRequest('a/b'), 'GET', /\/portal-requests\/a%2Fb$/],
    ['createRequest', () => createRequest({ title: 'x' }), 'POST', /\/portal-requests$/],
    ['saveRequest', () => saveRequest(4, { title: 'x' }), 'PUT', /\/portal-requests\/4$/],
    ['submitRequest', () => submitRequest(4), 'POST', /\/portal-requests\/4\/submit$/],
    ['removeRequestFile', () => removeRequestFile(4, 9), 'DELETE', /\/portal-requests\/4\/files\/9$/],
  ])('%s uses the right method and path and returns data', async (_name, call, method, path) => {
    global.fetch.mockResolvedValue(respond(200, { id: 4 }));
    const result = await call();
    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toMatch(path);
    expect(init.method).toBe(method);
    expect(result).toEqual({ ok: true, data: { id: 4 } });
  });

  test('createRequest and saveRequest send the body as JSON', async () => {
    global.fetch.mockResolvedValue(respond(200, {}));
    await saveRequest(4, { title: 'x' });
    expect(global.fetch.mock.calls[0][1].body).toBe('{"title":"x"}');
  });
});

describe('uploads', () => {
  const files = [new File(['a'], 'a.pdf'), new File(['b'], 'b.step')];

  test('uploadRequestFiles POSTs every file under the field files', async () => {
    global.fetch.mockResolvedValue(respond(201, []));
    await uploadRequestFiles(4, files);
    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toMatch(/\/portal-requests\/4\/files$/);
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);
    expect(init.body.getAll('files')).toEqual(files);
  });

  test('uploadLineFiles POSTs to the line files path', async () => {
    global.fetch.mockResolvedValue(respond(201, []));
    await uploadLineFiles(4, 7, files);
    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toMatch(/\/portal-requests\/4\/lines\/7\/files$/);
    expect(init.body.getAll('files')).toEqual(files);
  });
});

describe('errors', () => {
  test.each([400, 409, 413])('%i carries the server error text as invalid', async (status) => {
    global.fetch.mockResolvedValue(respond(status, { error: 'Too big' }));
    const result = await getRequest(1);
    expect(result).toEqual({ ok: false, error: { kind: 'invalid', message: 'Too big' } });
  });

  test('400 without error text falls back to a generic sentence', async () => {
    global.fetch.mockResolvedValue({ ...respond(400, null), json: async () => { throw new Error('bad'); } });
    const result = await getRequest(1);
    expect(result.error.kind).toBe('invalid');
    expect(result.error.message).toBeTruthy();
  });

  test('401 signs out and drops the token', async () => {
    localStorage.setItem('token', 'abc');
    global.fetch.mockResolvedValue(respond(401, {}));
    const result = await listRequests();
    expect(result.error.kind).toBe('signed_out');
    expect(localStorage.getItem('token')).toBeNull();
  });

  test('404 is not_found', async () => {
    global.fetch.mockResolvedValue(respond(404, {}));
    expect((await getRequest(1)).error.kind).toBe('not_found');
  });

  test('429 is busy with the wait time', async () => {
    global.fetch.mockResolvedValue(respond(429, {}, { 'Retry-After': '120' }));
    const result = await submitRequest(1);
    expect(result.error).toEqual({ kind: 'busy', message: 'Too many requests. Try again in 2 minutes.' });
  });

  test('500 is a generic error', async () => {
    global.fetch.mockResolvedValue(respond(500, { error: 'secret' }));
    const result = await listRequests();
    expect(result.error.kind).toBe('error');
    expect(result.error.message).not.toMatch(/secret/);
  });

  test('network failure is an error kind', async () => {
    global.fetch.mockRejectedValue(new TypeError('offline'));
    const result = await uploadRequestFiles(1, []);
    expect(result.ok).toBe(false);
    expect(result.error.kind).toBe('error');
  });
});

describe('requestStatusLabel', () => {
  test.each([
    ['draft', 'Draft'], ['sent', 'Sent'], ['in_review', 'In review'], ['job_created', 'Job created'],
  ])('%s -> %s', (key, label) => {
    expect(requestStatusLabel(key)).toBe(label);
  });
});

describe('formatLocalDate', () => {
  test('shows the local month, day and year of a UTC timestamp', () => {
    const iso = '2026-10-29T03:30:00.000Z';
    const d = new Date(iso);
    expect(formatLocalDate(iso)).toBe(`${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`);
  });

  test.each([null, undefined, ''])('%p gives an em dash', (value) => {
    expect(formatLocalDate(value)).toBe('\u2014');
  });
});
