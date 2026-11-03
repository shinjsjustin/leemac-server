import { apiFetch } from './apiFetch';

const SIMPLE_PATH = '/internal/simple';
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
    console.error('Simple jobs call failed:', e);
    return { ok: false, error: { kind: 'error', message: GENERIC_MESSAGE } };
  }
}

export const listOverview = (page) => call(`${SIMPLE_PATH}/overview?page=${enc(page)}`, { method: 'GET' });
export const listQuoted = (page) => call(`${SIMPLE_PATH}/quoted?page=${enc(page)}`, { method: 'GET' });
export const setNoBid = (jobId) => call(`${SIMPLE_PATH}/jobs/${enc(jobId)}/no-bid`, { method: 'PUT' });
export const clearNoBid = (jobId) => call(`${SIMPLE_PATH}/jobs/${enc(jobId)}/no-bid`, { method: 'DELETE' });

/** Adds a private note on the whole job (no part, not shared with the client). */
export const addJobNote = (jobId, userId, content) =>
  call(`${NOTES_PATH}/newnote`, {
    method: 'POST',
    body: { content, userid: userId, jobid: jobId, shared: false },
  });
