const BASE = process.env.REACT_APP_URL || 'http://localhost:3001/api';

/**
 * Thin fetch wrapper used by all component API calls.
 *
 * - Prepends BASE to every path (pass a path like '/internal/...')
 * - Injects `Authorization: Bearer <token>` from localStorage when a token exists
 * - Sets `Content-Type: application/json` and JSON.stringify's the body when body
 *   is a plain object; leaves Content-Type unset for FormData so the browser can
 *   set the multipart boundary itself
 * - Returns the raw Response so callers keep their own .json()/.blob()/res.ok logic
 */
export async function apiFetch(path, { method = 'GET', body, headers: extraHeaders } = {}) {
  const token = localStorage.getItem('token');
  const isFormData = body instanceof FormData;

  const headers = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (!isFormData && body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const init = {
    method,
    headers: { ...headers, ...extraHeaders },
  };

  if (body !== undefined) {
    init.body = isFormData ? body : JSON.stringify(body);
  }

  return fetch(`${BASE}${path}`, init);
}

const SECONDS_PER_MINUTE = 60;

function positiveSeconds(response, name) {
  const seconds = Number(response.headers.get(name));
  return seconds > 0 ? seconds : null;
}

/**
 * User-facing text for a 429 response, shared by every auth screen.
 * Reads Retry-After (seconds), falling back to RateLimit-Reset.
 */
export function tooManyAttemptsMessage(response) {
  const seconds = positiveSeconds(response, 'Retry-After') ?? positiveSeconds(response, 'RateLimit-Reset');
  if (seconds === null) return 'Too many attempts. Try again later.';
  const minutes = Math.max(1, Math.ceil(seconds / SECONDS_PER_MINUTE));
  return `Too many attempts. Try again in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`;
}
