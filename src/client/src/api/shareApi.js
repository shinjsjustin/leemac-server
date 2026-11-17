import { apiFetch } from './apiFetch';
import { sendJson, portalError, NETWORK_ERROR } from './portalApi';

// Every call is a POST so the token travels in the body, never in a URL.
const post = (path, body) => ({ path: `/share${path}`, options: { method: 'POST', body } });

async function sendJsonCall({ path, options }) {
  const { response, ...result } = await sendJson(path, options);
  return result;
}

/** Resolves a blob URL for showing a file. The caller revokes it. */
async function fetchBlobUrl({ path, options }) {
  let response;
  try {
    response = await apiFetch(path, options);
  } catch {
    return { ok: false, error: NETWORK_ERROR };
  }
  if (!response.ok) return { ok: false, error: portalError(response) };
  return { ok: true, url: URL.createObjectURL(await response.blob()) };
}

export const openSharedQuote = (token) => sendJsonCall(post('/quote', { token }));
export const openSharedQc = (token) => sendJsonCall(post('/qc', { token }));
export const fetchSharedQuotePdfUrl = (token) => fetchBlobUrl(post('/quote/pdf', { token }));
export const fetchSharedDrawingUrl = (token, fileId) => fetchBlobUrl(post('/qc/drawing', { token, file_id: fileId }));
export const fetchSharedPhotoUrl = (token, photoId) => fetchBlobUrl(post('/qc/photo', { token, photo_id: photoId }));
