import { apiFetch } from './apiFetch';

const GENERIC_MESSAGE = 'Something went wrong. Please try again.';
const INVALID_STATUSES = [400, 403, 413];
const PHOTO_FIELD = 'photo';

const failure = (kind, message) => ({ ok: false, error: { kind, message } });
const generic = () => failure('error', GENERIC_MESSAGE);
const enc = encodeURIComponent;

async function invalidError(response) {
  const body = await response.json().catch(() => null);
  return failure('invalid', typeof body?.error === 'string' && body.error ? body.error : GENERIC_MESSAGE);
}

async function call(path, options) {
  let response;
  try {
    response = await apiFetch(`/internal/qc${path}`, options);
  } catch {
    return generic();
  }
  if (INVALID_STATUSES.includes(response.status)) return invalidError(response);
  if (!response.ok) return generic();
  return { ok: true, data: await response.json() };
}

export const getAdminPartQc = (partId) => call(`/parts/${enc(partId)}`);
export const addLeemacMarking = (partId, marking) =>
  call(`/parts/${enc(partId)}/markings`, { method: 'POST', body: marking });
export const editLeemacMarking = (id, marking) => call(`/markings/${enc(id)}`, { method: 'PUT', body: marking });
export const deleteLeemacMarking = (id) => call(`/markings/${enc(id)}`, { method: 'DELETE' });
export const clearLeemacMarkings = (partId) => call(`/parts/${enc(partId)}/markings`, { method: 'DELETE' });

/** fields is { job_id, value?, caption? }; file is the image File. */
export function uploadPhoto(markingId, fields, file) {
  const form = new FormData();
  Object.entries(fields).forEach(([key, value]) => form.append(key, value));
  form.append(PHOTO_FIELD, file);
  return call(`/markings/${enc(markingId)}/photos`, { method: 'POST', body: form });
}

export const updatePhoto = (id, fields) => call(`/photos/${enc(id)}`, { method: 'PUT', body: fields });
export const reorderPhotos = (markingId, ids) =>
  call(`/markings/${enc(markingId)}/photos/order`, { method: 'PUT', body: { ids } });
export const deletePhoto = (id) => call(`/photos/${enc(id)}`, { method: 'DELETE' });
export const listQcRequests = () => call('/requests');
export const dismissQcRequest = (id) => call(`/requests/${enc(id)}/dismiss`, { method: 'PUT' });

/** Resolves a blob URL for showing a photo. The caller revokes it. */
export async function fetchAdminPhotoUrl(id) {
  let response;
  try {
    response = await apiFetch(`/internal/qc/photos/${enc(id)}`);
  } catch {
    return generic();
  }
  if (!response.ok) return generic();
  return { ok: true, url: URL.createObjectURL(await response.blob()) };
}
