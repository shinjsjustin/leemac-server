import contracts from './contracts/partPoolApi.json';
import { addPoolPart, uploadPoolFile } from './partPoolApi';

const GENERIC = 'Something went wrong. Please try again.';

const respond = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

const fileNamed = (name) => new File(['x'], name, { type: 'application/pdf' });

beforeEach(() => {
  localStorage.clear();
  global.fetch = jest.fn();
});

describe('contract fixture', () => {
  test('addPoolPart sends the fixture method, path and body', async () => {
    const entry = contracts.addPoolPart;
    global.fetch.mockResolvedValue(respond(201, { id: 1, number: 'P-100' }));
    const result = await addPoolPart(...entry.args);
    const [url, init] = global.fetch.mock.calls[0];
    expect(url.endsWith(entry.path)).toBe(true);
    expect(init.method).toBe(entry.method);
    expect(JSON.parse(init.body)).toEqual(entry.body);
    expect(result).toEqual({ ok: true, data: { id: 1, number: 'P-100' } });
  });

  test('uploadPoolFile sends the fixture method and path with one form field', async () => {
    const entry = contracts.uploadPoolFile;
    global.fetch.mockResolvedValue(respond(201, { id: 9 }));
    const [partId, name] = entry.args;
    const result = await uploadPoolFile(partId, fileNamed(name));
    const [url, init] = global.fetch.mock.calls[0];
    expect(url.endsWith(entry.path)).toBe(true);
    expect(init.method).toBe(entry.method);
    expect([...init.body.keys()]).toEqual([entry.formField]);
    expect(init.body.get(entry.formField).name).toBe(name);
    expect(result).toEqual({ ok: true, data: { id: 9 } });
  });
});

describe('errors', () => {
  const calls = [
    ['addPoolPart', () => addPoolPart('a', 'b')],
    ['uploadPoolFile', () => uploadPoolFile(1, fileNamed('a.pdf'))],
  ];

  describe.each(calls)('%s', (_name, call) => {
    test.each([400, 404, 409, 413])('%i carries the server error text', async (status) => {
      global.fetch.mockResolvedValue(respond(status, { error: 'Server said no' }));
      expect(await call()).toEqual({ ok: false, error: { kind: 'invalid', message: 'Server said no' } });
    });

    test.each([401, 500, 502])('%i gets a generic message', async (status) => {
      global.fetch.mockResolvedValue(respond(status, { error: 'secret' }));
      expect(await call()).toEqual({ ok: false, error: { kind: 'error', message: GENERIC } });
    });

    test('a non-JSON reply gets a generic message', async () => {
      global.fetch.mockResolvedValue({ ...respond(413, null), json: async () => { throw new SyntaxError('html'); } });
      const result = await call();
      expect(result.ok).toBe(false);
      expect(result.error.message).toBe(GENERIC);
    });

    test('a thrown fetch gets a generic message', async () => {
      global.fetch.mockRejectedValue(new TypeError('offline'));
      expect(await call()).toEqual({ ok: false, error: { kind: 'error', message: GENERIC } });
    });
  });
});
