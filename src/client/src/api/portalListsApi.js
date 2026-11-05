import { apiFetch } from './apiFetch';
import { portalError } from './portalApi';

const GENERIC_MESSAGE = 'Something went wrong. Please try again.';
const INVALID_STATUSES = [400, 409, 413];

async function invalidError(response) {
  const body = await response.json().catch(() => null);
  const message = typeof body?.error === 'string' && body.error ? body.error : GENERIC_MESSAGE;
  return { kind: 'invalid', message };
}

async function call(path, options) {
  let response;
  try {
    response = await apiFetch(`/portal-lists${path}`, options);
  } catch {
    return { ok: false, error: { kind: 'error', message: GENERIC_MESSAGE } };
  }
  if (INVALID_STATUSES.includes(response.status)) return { ok: false, error: await invalidError(response) };
  if (!response.ok) return { ok: false, error: portalError(response) };
  return { ok: true, data: await response.json() };
}

const enc = encodeURIComponent;

export const listLists = () => call('');
export const createList = (name) => call('', { method: 'POST', body: { name } });
export const renameList = (id, name) => call(`/${enc(id)}`, { method: 'PUT', body: { name } });
export const deleteList = (id) => call(`/${enc(id)}`, { method: 'DELETE' });
export const addPartsToList = (id, partIds) =>
  call(`/${enc(id)}/parts`, { method: 'POST', body: { part_ids: partIds } });
export const removePartsFromList = (id, partIds) =>
  call(`/${enc(id)}/parts/remove`, { method: 'POST', body: { part_ids: partIds } });
export const getRequestLines = (id) => call(`/${enc(id)}/request-lines`);
export const requestFromList = (id, body) => call(`/${enc(id)}/request`, { method: 'POST', body });

// The share token goes in POST bodies only: the portal audit logs request paths.
export const previewSharedList = (token) => call('/shared/invite', { method: 'POST', body: { token } });
export const joinSharedList = (token) => call('/shared/invite/join', { method: 'POST', body: { token } });
export const listSharedLists = () => call('/shared');
export const getSharedList = (id) => call(`/shared/${enc(id)}`);
export const renameSharedList = (id, name) => call(`/shared/${enc(id)}`, { method: 'PUT', body: { name } });
export const addPartsToSharedList = (id, partIds) =>
  call(`/shared/${enc(id)}/parts`, { method: 'POST', body: { part_ids: partIds } });
export const removePartsFromSharedList = (id, partIds) =>
  call(`/shared/${enc(id)}/parts/remove`, { method: 'POST', body: { part_ids: partIds } });
export const leaveSharedList = (id) => call(`/shared/${enc(id)}/leave`, { method: 'POST' });
export const getSharedRequestLines = (id) => call(`/shared/${enc(id)}/request-lines`);
export const requestFromSharedList = (id, body) => call(`/shared/${enc(id)}/request`, { method: 'POST', body });
