import { apiFetch } from './apiFetch';

const GENERIC_MESSAGE = 'Something went wrong. Please try again.';

const failure = (message) => ({ ok: false, error: { message } });

async function errorMessage(response) {
  const body = await response.json().catch(() => null);
  return typeof body?.error === 'string' && body.error ? body.error : GENERIC_MESSAGE;
}

// Runs the request; never throws.
async function call(path, options) {
  try {
    const response = await apiFetch(path, options);
    if (!response.ok) return failure(await errorMessage(response));
    return { ok: true, data: await response.json() };
  } catch {
    return failure(GENERIC_MESSAGE);
  }
}

export const listDocuments = (jobId) =>
  call(`/internal/job/documents?id=${encodeURIComponent(jobId)}`);

export const makeDocument = (jobId, type) =>
  call(`/internal/job/documents/make?id=${encodeURIComponent(jobId)}&type=${encodeURIComponent(type)}`, {
    method: 'POST',
  });
