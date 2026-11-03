import { markNoBid, undoNoBid } from './quotedActions';
import { setNoBid, clearNoBid } from '../../api/simpleJobsApi';

jest.mock('../../api/simpleJobsApi', () => ({ setNoBid: jest.fn(), clearNoBid: jest.fn() }));

beforeEach(() => jest.clearAllMocks());

const cases = [
  ['markNoBid', markNoBid, setNoBid],
  ['undoNoBid', undoNoBid, clearNoBid],
];

describe.each(cases)('%s', (_name, action, api) => {
  test('calls the API for the job then reloads on success', async () => {
    api.mockResolvedValue({ ok: true, data: {} });
    const reload = jest.fn();
    const result = await action({ jobId: 7, access: 3, reload });
    expect(api).toHaveBeenCalledWith(7);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ok: true });
  });

  test('returns the server error without reloading on failure', async () => {
    const error = { kind: 'invalid', message: 'Job already has a PO' };
    api.mockResolvedValue({ ok: false, error });
    const reload = jest.fn();
    const result = await action({ jobId: 7, access: 3, reload });
    expect(result).toEqual({ ok: false, error });
    expect(reload).not.toHaveBeenCalled();
  });

  test('refuses below level 3 without calling the API', async () => {
    const reload = jest.fn();
    const result = await action({ jobId: 7, access: 2, reload });
    expect(result.ok).toBe(false);
    expect(api).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });
});
