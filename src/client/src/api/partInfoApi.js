import { apiFetch } from './apiFetch';

const PART_PATH = '/internal/part';
const NOTES_PATH = '/internal/notes';
const GENERIC_MESSAGE = 'Something went wrong. Please try again.';
const INVALID_STATUSES = [400, 409];
const DENIED_STATUSES = [401, 403];
const NOT_FOUND_STATUS = 404;

const enc = encodeURIComponent;

async function failure(response) {
  if (INVALID_STATUSES.includes(response.status)) {
    const body = await response.json().catch(() => null);
    const message = typeof body?.error === 'string' && body.error ? body.error : GENERIC_MESSAGE;
    return { ok: false, error: { kind: 'invalid', message } };
  }
  let kind = 'error';
  if (DENIED_STATUSES.includes(response.status)) kind = 'denied';
  else if (response.status === NOT_FOUND_STATUS) kind = 'not_found';
  return { ok: false, error: { kind, message: GENERIC_MESSAGE } };
}

async function call(path, options) {
  try {
    const response = await apiFetch(path, options);
    if (!response.ok) return await failure(response);
    return { ok: true, data: await response.json() };
  } catch (e) {
    console.error('Part info call failed:', e);
    return { ok: false, error: { kind: 'error', message: GENERIC_MESSAGE } };
  }
}

export const listPartNotes = (partId) => call(`${NOTES_PATH}/partnotes?partid=${enc(partId)}`, { method: 'GET' });
export const setNoteShared = (id, shared) => call(`${NOTES_PATH}/share`, { method: 'PUT', body: { id, shared } });
export const saveProcessSteps = (id, text) =>
  call(`${PART_PATH}/processsteps`, { method: 'PUT', body: { id, process_steps: text } });
