import { listOverview, listQuoted, setNoBid, clearNoBid, addJobNote } from './simpleJobsApi';
import { apiFetch } from './apiFetch';
import contracts from './contracts/simpleJobsApi.json';

jest.mock('./apiFetch', () => ({ apiFetch: jest.fn() }));

const GENERIC = 'Something went wrong. Please try again.';
const respond = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

beforeEach(() => apiFetch.mockReset());

describe('calls', () => {
  test.each([
    ['listOverview', () => listOverview(2), ['/internal/simple/overview?page=2', { method: 'GET' }]],
    ['listQuoted', () => listQuoted(3), ['/internal/simple/quoted?page=3', { method: 'GET' }]],
    ['setNoBid', () => setNoBid(5), ['/internal/simple/jobs/5/no-bid', { method: 'PUT' }]],
    ['clearNoBid', () => clearNoBid(5), ['/internal/simple/jobs/5/no-bid', { method: 'DELETE' }]],
    ['addJobNote', () => addJobNote(5, 7, 'hi'),
      ['/internal/notes/newnote', { method: 'POST', body: { content: 'hi', userid: 7, jobid: 5, shared: false } }]],
  ])('%s uses the right method, path and body and returns data', async (_name, call, args) => {
    apiFetch.mockResolvedValue(respond(200, { x: 1 }));
    expect(await call()).toEqual({ ok: true, data: { x: 1 } });
    expect(apiFetch).toHaveBeenCalledWith(...args);
  });
});

describe('errors', () => {
  test.each([
    [409, 'invalid', 'Job already has a PO'],
    [400, 'invalid', 'Job already has a PO'],
    [401, 'denied', GENERIC],
    [403, 'denied', GENERIC],
    [404, 'not_found', GENERIC],
    [500, 'error', GENERIC],
  ])('status %i maps to kind %s', async (status, kind, message) => {
    apiFetch.mockResolvedValue(respond(status, { error: 'Job already has a PO' }));
    expect(await setNoBid(1)).toEqual({ ok: false, error: { kind, message } });
  });

  test('invalid without an error body gets a generic sentence', async () => {
    apiFetch.mockResolvedValue({ ok: false, status: 409, json: async () => { throw new Error('no json'); } });
    expect(await setNoBid(1)).toEqual({ ok: false, error: { kind: 'invalid', message: GENERIC } });
  });

  test('network failure gives kind error', async () => {
    apiFetch.mockRejectedValue(new Error('offline'));
    expect((await listOverview(1)).error.kind).toBe('error');
  });
});

describe('simpleJobsApi contract fixture', () => {
  const fns = { listOverview, listQuoted, setNoBid, clearNoBid, addJobNote };

  beforeEach(() => {
    apiFetch.mockImplementation(jest.requireActual('./apiFetch').apiFetch);
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
  });

  test('has an entry for every function under test', () => {
    expect(Object.keys(contracts).sort()).toEqual(Object.keys(fns).sort());
  });

  test.each(Object.entries(contracts))('%s sends the fixture request', async (name, entry) => {
    await fns[name](...entry.args);
    const [url, init] = global.fetch.mock.calls[0];
    expect(url.endsWith(entry.path)).toBe(true);
    expect(init.method).toBe(entry.method);
    expect(init.body === undefined ? null : JSON.parse(init.body)).toEqual(entry.body);
  });

  test('addJobNote body is exactly the private job note shape', () => {
    expect(contracts.addJobNote.body).toEqual({ content: 'Call back Monday', userid: 7, jobid: 5, shared: false });
  });
});
