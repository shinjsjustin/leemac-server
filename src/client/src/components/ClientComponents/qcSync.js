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

/**
 * Diffs the last saved markings against the editor's and sends only own-marking changes.
 * `stored` is what the server holds afterwards: the saved markings with only the successful jobs applied.
 */
export async function saveChanges(partId, saved, current) {
  const savedById = new Map(saved.filter(isOwn).map((m) => [m.id, m]));
  const currentOwn = current.filter(isOwn);
  const currentIds = new Set(currentOwn.map((m) => m.id));

  const jobs = [];
  for (const marking of currentOwn) {
    if (isTemporary(marking)) {
      jobs.push({
        tempId: marking.id,
        send: () => addMarking(partId, toBody(marking)),
        apply: (list, data) => [...list, { ...marking, id: data.id }],
      });
    } else if (savedById.has(marking.id) && hasChanged(savedById.get(marking.id), marking)) {
      jobs.push({
        send: () => editMarking(marking.id, toBody(marking)),
        apply: (list) => list.map((m) => (m.id === marking.id ? marking : m)),
      });
    }
  }
  for (const marking of savedById.values()) {
    if (currentIds.has(marking.id)) continue;
    jobs.push({
      send: () => deleteMarking(marking.id),
      apply: (list) => list.filter((m) => m.id !== marking.id),
    });
  }

  const idMap = {};
  let stored = saved;
  let firstError = null;
  for (const { tempId, send, apply } of jobs) {
    const result = await send();
    if (!result.ok) {
      firstError = firstError ?? result.error;
      continue;
    }
    if (tempId !== undefined) idMap[tempId] = result.data.id;
    stored = apply(stored, result.data);
  }
  return firstError ? { ok: false, error: firstError, idMap, stored } : { ok: true, idMap, stored };
}

/**
 * Runs saves one at a time against a shared saved snapshot. A save asked for while another is in flight
 * waits for it, then diffs against what that save stored, so a temporary marking is added only once.
 * Server ids replace temporary ids in the current markings even before the editor state catches up.
 */
export function createSaveQueue(partId, initialSaved) {
  let saved = initialSaved;
  const idMap = {};
  let tail = Promise.resolve();
  const swap = (list) => list.map((m) => (m.id in idMap ? { ...m, id: idMap[m.id] } : m));

  const runNow = async (send, getCurrent) => {
    const sent = swap(getCurrent());
    const result = await send(partId, saved, sent);
    Object.assign(idMap, result.idMap);
    saved = result.stored;
    return result;
  };

  return {
    run(send, getCurrent) {
      const next = tail.then(() => runNow(send, getCurrent));
      tail = next.catch(() => {});
      return next;
    },
    reset(list) {
      saved = list;
    },
    saved: () => saved,
    hasChanges(current) {
      const own = swap(current).filter(isOwn);
      const savedOwn = saved.filter(isOwn);
      if (own.length !== savedOwn.length) return true;
      const byId = new Map(savedOwn.map((m) => [m.id, m]));
      return own.some((m) => !byId.has(m.id) || hasChanged(byId.get(m.id), m));
    },
  };
}

/** Saves, then pings Leemac only when every save succeeded. */
export async function pingAfterSave(partId, saved, current) {
  const saveResult = await saveChanges(partId, saved, current);
  if (!saveResult.ok) return saveResult;
  const pinged = await pingLeemac(partId);
  return pinged.ok ? saveResult : { ok: false, error: pinged.error, idMap: saveResult.idMap, stored: saveResult.stored };
}

/** Removes the client's own markings and returns the reloaded part state. */
export async function clearAll(partId) {
  const cleared = await clearMarkings(partId);
  if (!cleared.ok) return cleared;
  return getPartQc(partId);
}
