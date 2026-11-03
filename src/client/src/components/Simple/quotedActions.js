import { setNoBid, clearNoBid } from '../../api/simpleJobsApi';
import { canMarkNoBid, LOCKED_MESSAGE } from './simpleCard';

const run = (apiCall) => async ({ jobId, access, reload }) => {
  if (!canMarkNoBid(access)) {
    return { ok: false, error: { kind: 'denied', message: LOCKED_MESSAGE } };
  }
  const result = await apiCall(jobId);
  if (!result.ok) return { ok: false, error: result.error };
  reload();
  return { ok: true };
};

export const markNoBid = run(setNoBid);
export const undoNoBid = run(clearNoBid);
