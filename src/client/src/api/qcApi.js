import { apiFetch } from './apiFetch';
import { sendJson, portalError, NETWORK_ERROR } from './portalApi';

const HTTP_BAD_REQUEST = 400;
const enc = encodeURIComponent;

/** A 400 carries the server's own message. */
async function send(path, method, body) {
  const { response, ...result } = await sendJson(path, { method, body });
  if (response?.status !== HTTP_BAD_REQUEST) return result;
  const errorBody = await response.json().catch(() => null);
  if (typeof errorBody?.error !== 'string') return result;
  return { ok: false, error: { kind: 'invalid', message: errorBody.error } };
}

export const getPartQc = (partId) => send(`/portal-qc/parts/${enc(partId)}`, 'GET');
export const addMarking = (partId, marking) => send(`/portal-qc/parts/${enc(partId)}/markings`, 'POST', marking);
export const editMarking = (id, marking) => send(`/portal-qc/markings/${enc(id)}`, 'PUT', marking);
export const deleteMarking = (id) => send(`/portal-qc/markings/${enc(id)}`, 'DELETE');
export const clearMarkings = (partId) => send(`/portal-qc/parts/${enc(partId)}/markings`, 'DELETE');
export const pingLeemac = (partId) => send(`/portal-qc/parts/${enc(partId)}/ping`, 'POST');

/** Resolves a blob URL for showing a photo. The caller revokes it. */
export async function fetchPhotoUrl(id) {
  let response;
  try {
    response = await apiFetch(`/portal-qc/photos/${enc(id)}`);
  } catch {
    return { ok: false, error: NETWORK_ERROR };
  }
  if (!response.ok) return { ok: false, error: portalError(response) };
  return { ok: true, url: URL.createObjectURL(await response.blob()) };
}
