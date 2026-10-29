import { apiFetch } from './apiFetch';

const BASE_PATH = '/internal/quote-requests';
const GENERIC_MESSAGE = 'Something went wrong. Please try again.';
const INVALID_STATUSES = [400, 409];
const DENIED_STATUSES = [401, 403];
const NOT_FOUND_STATUS = 404;
const STATUS_LABELS = {
  sent: 'Sent',
  in_review: 'In review',
  job_created: 'Job created',
};

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

async function request(path, options, onSuccess) {
  try {
    const response = await (options ? apiFetch(path, options) : apiFetch(path));
    if (!response.ok) return await failure(response);
    return await onSuccess(response);
  } catch (e) {
    console.error('Quote request admin call failed:', e);
    return { ok: false, error: { kind: 'error', message: GENERIC_MESSAGE } };
  }
}

const call = (path, options) =>
  request(`${BASE_PATH}${path}`, options, async (response) => ({ ok: true, data: await response.json() }));

export const listInbox = (status) =>
  call(status ? `?status=${enc(status)}` : '', { method: 'GET' });
export const getReview = (id) => call(`/${enc(id)}`, { method: 'GET' });
export const saveReview = (id, lines) => call(`/${enc(id)}`, { method: 'PUT', body: { lines } });
export const checkMatches = (id, lines) => call(`/${enc(id)}/check`, { method: 'POST', body: { lines } });
export const createJob = (id) => call(`/${enc(id)}/job`, { method: 'POST' });
export const removeLine = (id, lineId) => call(`/${enc(id)}/lines/${enc(lineId)}`, { method: 'DELETE' });

/** Resolves a blob URL for previewing a request file. The caller revokes it. */
export const fetchRequestFileUrl = (id, fileId) =>
  request(`${BASE_PATH}/${enc(id)}/files/${enc(fileId)}`, undefined, async (response) => ({
    ok: true,
    url: URL.createObjectURL(await response.blob()),
  }));

export function requestStatusLabel(status) {
  return STATUS_LABELS[status] ?? String(status);
}
