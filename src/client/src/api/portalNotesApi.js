import { sendJson } from './portalApi';

const HTTP_BAD_REQUEST = 400;

export async function listNotes() {
  const { response, ...result } = await sendJson('/portal-notes');
  return result;
}

/** target is { job_id } or { part_id }. A 400 carries the server's own message. */
export async function addNote(target, content) {
  const { response, ...result } = await sendJson('/portal-notes', {
    method: 'POST',
    body: { ...target, content },
  });
  if (response?.status !== HTTP_BAD_REQUEST) return result;
  const body = await response.json().catch(() => null);
  if (typeof body?.error !== 'string') return result;
  return { ok: false, error: { kind: 'invalid', message: body.error } };
}
