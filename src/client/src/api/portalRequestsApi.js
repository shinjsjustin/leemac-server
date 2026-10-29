import { apiFetch } from './apiFetch';
import { portalError } from './portalApi';

const GENERIC_MESSAGE = 'Something went wrong. Please try again.';
const INVALID_STATUSES = [400, 409, 413];
const STATUS_LABELS = {
  draft: 'Draft',
  sent: 'Sent',
  in_review: 'In review',
  job_created: 'Job created',
};

async function invalidError(response) {
  const body = await response.json().catch(() => null);
  const message = typeof body?.error === 'string' && body.error ? body.error : GENERIC_MESSAGE;
  return { kind: 'invalid', message };
}

async function call(path, options) {
  let response;
  try {
    response = await apiFetch(`/portal-requests${path}`, options);
  } catch {
    return { ok: false, error: { kind: 'error', message: GENERIC_MESSAGE } };
  }
  if (INVALID_STATUSES.includes(response.status)) return { ok: false, error: await invalidError(response) };
  if (!response.ok) return { ok: false, error: portalError(response) };
  return { ok: true, data: await response.json() };
}

function filesBody(files) {
  const form = new FormData();
  files.forEach((file) => form.append('files', file));
  return form;
}

const enc = encodeURIComponent;

export const listRequests = () => call('');
export const getRequest = (id) => call(`/${enc(id)}`);
export const createRequest = (body) => call('', { method: 'POST', body });
export const saveRequest = (id, body) => call(`/${enc(id)}`, { method: 'PUT', body });
export const submitRequest = (id) => call(`/${enc(id)}/submit`, { method: 'POST' });
export const uploadRequestFiles = (id, files) => call(`/${enc(id)}/files`, { method: 'POST', body: filesBody(files) });
export const uploadLineFiles = (id, lineId, files) =>
  call(`/${enc(id)}/lines/${enc(lineId)}/files`, { method: 'POST', body: filesBody(files) });
export const removeRequestFile = (id, fileId) => call(`/${enc(id)}/files/${enc(fileId)}`, { method: 'DELETE' });

/** Resolves a blob URL for previewing a saved request file. The caller revokes it. */
export async function fetchRequestFileUrl(file) {
  let response;
  try {
    response = await apiFetch(`/portal-requests/${enc(file.request_id)}/files/${enc(file.id)}`, { method: 'GET' });
  } catch {
    return { ok: false, error: { kind: 'error', message: GENERIC_MESSAGE } };
  }
  if (!response.ok) return { ok: false, error: portalError(response) };
  return { ok: true, url: URL.createObjectURL(await response.blob()) };
}

export function requestStatusLabel(status) {
  return STATUS_LABELS[status] ?? String(status);
}

export function formatLocalDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
}
