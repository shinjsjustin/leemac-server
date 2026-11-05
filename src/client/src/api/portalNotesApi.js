import { sendJson } from './portalApi';

const HTTP_BAD_REQUEST = 400;

export async function listNotes() {
  const { response, ...result } = await sendJson('/portal-notes');
  return result;
}

/** A 400 carries the server's own message. */
async function sendNote(path, method, body) {
  const { response, ...result } = await sendJson(path, { method, body });
  if (response?.status !== HTTP_BAD_REQUEST) return result;
  const errorBody = await response.json().catch(() => null);
  if (typeof errorBody?.error !== 'string') return result;
  return { ok: false, error: { kind: 'invalid', message: errorBody.error } };
}

/** target is { job_id } or { part_id }. */
export function addNote(target, content) {
  return sendNote('/portal-notes', 'POST', { ...target, content });
}

export function editNote(id, content) {
  return sendNote(`/portal-notes/${id}`, 'PUT', { content });
}
