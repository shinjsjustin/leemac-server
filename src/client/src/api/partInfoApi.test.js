import { listPartNotes, setNoteShared, saveProcessSteps } from './partInfoApi';
import { apiFetch } from './apiFetch';
import contracts from './contracts/partInfoApi.json';

jest.mock('./apiFetch', () => ({ apiFetch: jest.fn() }));

const GENERIC = 'Something went wrong. Please try again.';
const respond = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

beforeEach(() => apiFetch.mockReset());

const fns = { listPartNotes, setNoteShared, saveProcessSteps };

describe('calls', () => {
  test.each(Object.entries(contracts))('%s sends the contract request and returns data', async (name, entry) => {
    apiFetch.mockResolvedValue(respond(200, { x: 1 }));
    expect(await fns[name](...entry.args)).toEqual({ ok: true, data: { x: 1 } });
    const options = { method: entry.method, ...(entry.body ? { body: entry.body } : {}) };
    expect(apiFetch).toHaveBeenCalledWith(entry.path, options);
  });

  test('has an entry for every function', () => {
    expect(Object.keys(contracts).sort()).toEqual(Object.keys(fns).sort());
  });
});

describe('errors', () => {
  test.each([
    [400, 'invalid', 'Too long'],
    [403, 'denied', GENERIC],
    [404, 'not_found', GENERIC],
    [500, 'error', GENERIC],
  ])('status %i maps to kind %s', async (status, kind, message) => {
    apiFetch.mockResolvedValue(respond(status, { error: 'Too long' }));
    expect(await saveProcessSteps(5, 'x')).toEqual({ ok: false, error: { kind, message } });
  });

  test('network failure gives kind error', async () => {
    apiFetch.mockRejectedValue(new Error('offline'));
    expect(await listPartNotes(5)).toEqual({ ok: false, error: { kind: 'error', message: GENERIC } });
  });
});
