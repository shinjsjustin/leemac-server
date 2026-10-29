import contracts from './contracts/portalNotesApi.json';
import { listNotes, addNote } from './portalNotesApi';

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

describe('listNotes', () => {
  test('GETs /portal-notes and returns data', async () => {
    global.fetch.mockResolvedValue(respond(200, { jobs: {}, parts: {} }));
    const result = await listNotes();
    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toMatch(/\/portal-notes$/);
    expect(init.method).toBe('GET');
    expect(result).toEqual({ ok: true, data: { jobs: {}, parts: {} } });
  });

  test('401 drops the token', async () => {
    localStorage.setItem('token', 'abc');
    global.fetch.mockResolvedValue(respond(401, {}));
    const result = await listNotes();
    expect(result.error.kind).toBe('signed_out');
    expect(localStorage.getItem('token')).toBeNull();
  });

  test('network failure resolves to the generic error', async () => {
    global.fetch.mockRejectedValue(new TypeError('offline'));
    expect(await listNotes()).toEqual({ ok: false, error: { kind: 'error', message: 'Something went wrong. Please try again.' } });
  });
});

describe('addNote', () => {
  test.each([
    [{ job_id: 4 }, { job_id: 4, content: 'hi' }],
    [{ part_id: 9 }, { part_id: 9, content: 'hi' }],
  ])('POSTs %j with content as JSON', async (target, body) => {
    global.fetch.mockResolvedValue(respond(201, { id: 1 }));
    const result = await addNote(target, 'hi');
    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toMatch(/\/portal-notes$/);
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual(body);
    expect(result).toEqual({ ok: true, data: { id: 1 } });
  });

  test('400 returns the server error message', async () => {
    global.fetch.mockResolvedValue(respond(400, { error: 'Content is required' }));
    expect(await addNote({ job_id: 4 }, '')).toEqual({
      ok: false,
      error: { kind: 'invalid', message: 'Content is required' },
    });
  });

  test('400 without a readable body falls back to the generic error', async () => {
    global.fetch.mockResolvedValue({ ...respond(400), json: async () => { throw new SyntaxError('bad'); } });
    const result = await addNote({ job_id: 4 }, 'x');
    expect(result).toEqual({ ok: false, error: { kind: 'error', message: 'Something went wrong. Please try again.' } });
  });

  test('401 drops the token', async () => {
    localStorage.setItem('token', 'abc');
    global.fetch.mockResolvedValue(respond(401, {}));
    const result = await addNote({ job_id: 4 }, 'x');
    expect(result.error.kind).toBe('signed_out');
    expect(localStorage.getItem('token')).toBeNull();
  });

  test('429 resolves to busy', async () => {
    global.fetch.mockResolvedValue(respond(429, {}, { 'Retry-After': '120' }));
    const result = await addNote({ job_id: 4 }, 'x');
    expect(result).toEqual({ ok: false, error: { kind: 'busy', message: 'Too many requests. Try again in 2 minutes.' } });
  });

  test('network failure resolves to the generic error', async () => {
    global.fetch.mockRejectedValue(new TypeError('offline'));
    const result = await addNote({ part_id: 2 }, 'x');
    expect(result).toEqual({ ok: false, error: { kind: 'error', message: 'Something went wrong. Please try again.' } });
  });
});

describe('portalNotesApi contract fixture', () => {
  const entries = Object.entries(contracts).flatMap(([name, value]) => [].concat(value).map((entry) => [name, entry]));
  const fns = { listNotes, addNote };

  test.each(entries.map(([name, entry]) => [`${name} ${JSON.stringify(entry.body)}`, name, entry]))(
    'sends %s',
    async (_label, name, entry) => {
      global.fetch.mockResolvedValue(respond(200, {}));
      await fns[name](...entry.args);
      const [url, init] = global.fetch.mock.calls[0];
      expect(url.endsWith(entry.path)).toBe(true);
      expect(init.method).toBe(entry.method);
      expect(init.body === undefined ? null : JSON.parse(init.body)).toEqual(entry.body);
    }
  );
});
