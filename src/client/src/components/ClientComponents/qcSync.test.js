import contracts from '../../api/contracts/qcApi.json';
import * as api from '../../api/qcApi';
import { saveChanges, pingAfterSave, clearAll } from './qcSync';

jest.mock('../../api/qcApi');

const OK = { ok: true, data: { ok: true } };
const FAIL = (message) => ({ ok: false, error: { kind: 'invalid', message } });

const own = (fields) => ({ mine: true, is_leemac: false, ...fields });
const point = own({ id: 7, file_id: 1, page: 1, kind: 'point', x1: 0.5, y1: 0.5, x2: null, y2: null, size: 10, note: 'hole' });
const box = own({ id: 2, file_id: 1, page: 1, kind: 'box', x1: 0.1, y1: 0.2, x2: 0.4, y2: 0.5, size: null, note: 'wider' });
const leemac = { id: 9, file_id: 1, page: 1, kind: 'point', x1: 0.2, y1: 0.2, x2: null, y2: null, size: 5, note: 'ours', mine: false, is_leemac: true };

beforeEach(() => {
  jest.resetAllMocks();
  api.addMarking.mockResolvedValue({ ok: true, data: { id: 31 } });
  api.editMarking.mockResolvedValue(OK);
  api.deleteMarking.mockResolvedValue(OK);
  api.pingLeemac.mockResolvedValue(OK);
});

describe('saveChanges', () => {
  test('adds a temporary marking with the contract body and maps its id', async () => {
    const created = { ...point, id: 'tmp-1' };
    const result = await saveChanges(1, [], [created]);
    expect(api.addMarking).toHaveBeenCalledTimes(1);
    expect(api.addMarking).toHaveBeenCalledWith(...contracts.addMarking.args);
    expect(result).toEqual({ ok: true, idMap: { 'tmp-1': 31 } });
  });

  test('edits a changed own marking with the contract body', async () => {
    const changed = { ...box, note: 'wider' };
    const result = await saveChanges(1, [{ ...box, note: 'old' }], [changed]);
    expect(api.editMarking).toHaveBeenCalledWith(...contracts.editMarking.args);
    expect(api.addMarking).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true, idMap: {} });
  });

  test('edits when only the shape moved', async () => {
    await saveChanges(1, [box], [{ ...box, x2: 0.9 }]);
    expect(api.editMarking).toHaveBeenCalledWith(2, expect.objectContaining({ x2: 0.9 }));
  });

  test('deletes an own marking that is gone', async () => {
    await saveChanges(1, [point, box], [point]);
    expect(api.deleteMarking).toHaveBeenCalledTimes(1);
    expect(api.deleteMarking).toHaveBeenCalledWith(...contracts.deleteMarking.args);
  });

  test('sends nothing for unchanged, Leemac, or missing Leemac markings', async () => {
    await saveChanges(1, [point, leemac], [point]);
    await saveChanges(1, [leemac], [{ ...leemac, note: 'edited' }]);
    expect(api.addMarking).not.toHaveBeenCalled();
    expect(api.editMarking).not.toHaveBeenCalled();
    expect(api.deleteMarking).not.toHaveBeenCalled();
  });

  test('returns the first error and keeps ids already saved', async () => {
    api.addMarking
      .mockResolvedValueOnce(FAIL('first'))
      .mockResolvedValueOnce({ ok: true, data: { id: 44 } });
    const a = { ...point, id: 'tmp-1' };
    const b = { ...point, id: 'tmp-2' };
    const result = await saveChanges(1, [], [a, b]);
    expect(result).toEqual({ ok: false, error: FAIL('first').error, idMap: { 'tmp-2': 44 } });
  });
});

describe('pingAfterSave', () => {
  test('pings after a successful save', async () => {
    const result = await pingAfterSave(1, [], [{ ...point, id: 'tmp-1' }]);
    expect(api.pingLeemac).toHaveBeenCalledWith(...contracts.pingLeemac.args);
    expect(result).toEqual({ ok: true, idMap: { 'tmp-1': 31 } });
  });

  test('does not ping when a save failed and returns its error', async () => {
    api.editMarking.mockResolvedValue(FAIL('bad note'));
    const result = await pingAfterSave(1, [box], [{ ...box, note: 'x' }]);
    expect(api.pingLeemac).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    expect(result.error.message).toBe('bad note');
  });

  test('returns the ping error', async () => {
    api.pingLeemac.mockResolvedValue(FAIL('rate limited'));
    const result = await pingAfterSave(1, [], []);
    expect(result.ok).toBe(false);
    expect(result.error.message).toBe('rate limited');
  });
});

describe('clearAll', () => {
  test('clears once then returns the reloaded state', async () => {
    const reloaded = { ok: true, data: { markings: [leemac], photos: [] } };
    api.clearMarkings.mockResolvedValue(OK);
    api.getPartQc.mockResolvedValue(reloaded);
    const result = await clearAll(1);
    expect(api.clearMarkings).toHaveBeenCalledTimes(1);
    expect(api.clearMarkings).toHaveBeenCalledWith(...contracts.clearMarkings.args);
    expect(api.getPartQc).toHaveBeenCalledWith(...contracts.getPartQc.args);
    expect(result).toBe(reloaded);
  });

  test('skips the reload when clearing failed', async () => {
    api.clearMarkings.mockResolvedValue(FAIL('nope'));
    const result = await clearAll(1);
    expect(api.getPartQc).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
  });
});
