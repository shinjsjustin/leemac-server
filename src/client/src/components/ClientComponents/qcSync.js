// Turns qcEditor state into qcApi calls. Plain async functions, no React.
import { addMarking, editMarking, deleteMarking, clearMarkings, getPartQc, pingLeemac } from '../../api/qcApi';

const isOwn = (marking) => marking.mine && !marking.is_leemac;
const isTemporary = (marking) => typeof marking.id === 'string';

/** The request body for a marking: a point carries a size, a line or box a second corner. */
function toBody(m) {
  const { file_id, page, kind, x1, y1, note } = m;
  const base = { file_id, page, kind, x1, y1 };
  const shape = kind === 'point' ? { size: m.size } : { x2: m.x2, y2: m.y2 };
  return { ...base, ...shape, note };
}

const hasChanged = (before, after) => JSON.stringify(toBody(before)) !== JSON.stringify(toBody(after));

/** Diffs the last saved markings against the editor's and sends only own-marking changes. */
export async function saveChanges(partId, saved, current) {
  const savedById = new Map(saved.filter(isOwn).map((m) => [m.id, m]));
  const currentOwn = current.filter(isOwn);
  const currentIds = new Set(currentOwn.map((m) => m.id));

  const jobs = [];
  for (const marking of currentOwn) {
    if (isTemporary(marking)) {
      jobs.push({ tempId: marking.id, send: () => addMarking(partId, toBody(marking)) });
    } else if (savedById.has(marking.id) && hasChanged(savedById.get(marking.id), marking)) {
      jobs.push({ send: () => editMarking(marking.id, toBody(marking)) });
    }
  }
  for (const marking of savedById.values()) {
    if (!currentIds.has(marking.id)) jobs.push({ send: () => deleteMarking(marking.id) });
  }

  const idMap = {};
  let firstError = null;
  for (const { tempId, send } of jobs) {
    const result = await send();
    if (!result.ok) firstError = firstError ?? result.error;
    else if (tempId !== undefined) idMap[tempId] = result.data.id;
  }
  return firstError ? { ok: false, error: firstError, idMap } : { ok: true, idMap };
}

/** Saves, then pings Leemac only when every save succeeded. */
export async function pingAfterSave(partId, saved, current) {
  const saveResult = await saveChanges(partId, saved, current);
  if (!saveResult.ok) return saveResult;
  const pinged = await pingLeemac(partId);
  return pinged.ok ? saveResult : { ok: false, error: pinged.error, idMap: saveResult.idMap };
}

/** Removes the client's own markings and returns the reloaded part state. */
export async function clearAll(partId) {
  const cleared = await clearMarkings(partId);
  if (!cleared.ok) return cleared;
  return getPartQc(partId);
}
