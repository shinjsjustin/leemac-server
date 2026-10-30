import { apiFetch } from './apiFetch';

const GENERIC_MESSAGE = 'Something went wrong. Please try again.';
const INVALID_STATUSES = [400, 409];

const failure = (kind, message) => ({ ok: false, error: { kind, message } });

async function invalidError(response) {
  const body = await response.json().catch(() => null);
  const message = typeof body?.error === 'string' && body.error ? body.error : GENERIC_MESSAGE;
  return failure('invalid', message);
}

async function call(path, options) {
  let response;
  try {
    response = await apiFetch(`/internal/part-lists${path}`, options);
  } catch {
    return failure('error', GENERIC_MESSAGE);
  }
  if (INVALID_STATUSES.includes(response.status)) return invalidError(response);
  if (!response.ok) return failure('error', GENERIC_MESSAGE);
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
