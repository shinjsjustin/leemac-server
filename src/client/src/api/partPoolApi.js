import { apiFetch } from './apiFetch';

const GENERIC_MESSAGE = 'Something went wrong. Please try again.';
// Statuses whose server text is safe to show; anything else may be a proxy page.
const SERVER_TEXT_STATUSES = [400, 404, 409, 413];

const failure = (kind, message) => ({ ok: false, error: { kind, message } });

async function serverError(response) {
  const body = await response.json().catch(() => null);
  const message = typeof body?.error === 'string' && body.error ? body.error : GENERIC_MESSAGE;
  return failure('invalid', message);
}

async function call(path, options) {
  let response;
  try {
    response = await apiFetch(`/internal/part/pool${path}`, options);
  } catch {
    return failure('error', GENERIC_MESSAGE);
  }
  if (SERVER_TEXT_STATUSES.includes(response.status)) return serverError(response);
  if (!response.ok) return failure('error', GENERIC_MESSAGE);
  const data = await response.json().catch(() => null);
  return data === null ? failure('error', GENERIC_MESSAGE) : { ok: true, data };
}

export const addPoolPart = (number, description) =>
  call('', { method: 'POST', body: { number, description } });

export const uploadPoolFile = (partId, file) => {
  const form = new FormData();
  form.append('file', file);
  return call(`/${encodeURIComponent(partId)}/files`, { method: 'POST', body: form });
};
