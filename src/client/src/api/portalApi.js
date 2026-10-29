import { apiFetch } from './apiFetch';
import { SHOP_STATUSES } from '../components/AdminComponents/ShopUpdate';

const SECONDS_PER_MINUTE = 60;
const SESSION_ENDED = 'Your session has ended. Please sign in again.';

function positiveSeconds(response, name) {
  const seconds = Number(response.headers.get(name));
  return seconds > 0 ? seconds : null;
}

function busyMessage(response) {
  const seconds = positiveSeconds(response, 'Retry-After') ?? positiveSeconds(response, 'RateLimit-Reset');
  if (seconds === null) return 'Try again later.';
  const minutes = Math.max(1, Math.ceil(seconds / SECONDS_PER_MINUTE));
  return `Too many requests. Try again in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`;
}

/** Maps a failed portal response to { kind, message }. A 401 also drops the stored token. */
export function portalError(response) {
  if (response.status === 401) {
    localStorage.removeItem('token');
    return { kind: 'signed_out', message: SESSION_ENDED };
  }
  if (response.status === 429) return { kind: 'busy', message: busyMessage(response) };
  if (response.status === 404) return { kind: 'not_found', message: 'Not found.' };
  return { kind: 'error', message: 'Something went wrong. Please try again.' };
}

export const NETWORK_ERROR = { kind: 'error', message: 'Something went wrong. Please try again.' };

async function request(path, options) {
  try {
    return await apiFetch(path, options);
  } catch {
    return null;
  }
}

const get = (path) => request(path);

async function getJson(path) {
  const response = await get(path);
  if (!response) return { ok: false, error: NETWORK_ERROR };
  if (!response.ok) return { ok: false, error: portalError(response) };
  return { ok: true, data: await response.json() };
}

/** Like getJson for any method: a network failure resolves to { ok: false } instead of throwing. */
export async function sendJson(path, options) {
  const response = await request(path, options);
  if (!response) return { ok: false, response: null, error: NETWORK_ERROR };
  if (!response.ok) return { ok: false, response, error: portalError(response) };
  return { ok: true, response, data: await response.json() };
}

export function getOverview() {
  return getJson('/portal/overview');
}

export function getSchedule() {
  return getJson('/portal/schedule');
}

export function getTicker() {
  return getJson('/portal/ticker');
}

export function listJobs({ limit, offset, q } = {}) {
  const params = new URLSearchParams();
  if (limit !== undefined) params.set('limit', limit);
  if (offset !== undefined) params.set('offset', offset);
  if (q?.trim()) params.set('q', q);
  const query = params.toString();
  return getJson(`/portal/jobs${query ? `?${query}` : ''}`);
}

export function getJob(id) {
  return getJson(`/portal/jobs/${encodeURIComponent(id)}`);
}

export function listParts({ number, description } = {}) {
  const params = new URLSearchParams();
  const filters = { number, description };
  Object.entries(filters).forEach(([key, value]) => {
    const trimmed = value?.trim();
    if (trimmed) params.set(key, trimmed);
  });
  const query = params.toString();
  return getJson(`/portal/parts${query ? `?${query}` : ''}`);
}

export function getPart(id) {
  return getJson(`/portal/parts/${encodeURIComponent(id)}`);
}

export function listPartFiles(partId) {
  return getJson(`/portal/parts/${encodeURIComponent(partId)}/files`);
}

export async function downloadFile(file) {
  const response = await get(`/portal/files/${encodeURIComponent(file.id)}`);
  if (!response) return { ok: false, error: NETWORK_ERROR };
  if (!response.ok) return { ok: false, error: portalError(response) };

  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = file.filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return { ok: true };
}

/** Resolves a blob URL for previewing a drawing. The caller revokes it. */
export async function fetchDrawingUrl(file) {
  const response = await get(`/portal/files/${encodeURIComponent(file.id)}`);
  if (!response) return { ok: false, error: NETWORK_ERROR };
  if (!response.ok) return { ok: false, error: portalError(response) };
  return { ok: true, url: URL.createObjectURL(await response.blob()) };
}

/** M/D/YYYY from the first 10 characters so time zones never shift the date. */
export function formatDate(value) {
  if (!value) return '—';
  const [year, month, day] = String(value).slice(0, 10).split('-').map(Number);
  return `${month}/${day}/${year}`;
}

export function fileKind({ filename = '', mimetype = '' }) {
  const name = filename.toLowerCase();
  if (name.endsWith('.pdf') || mimetype === 'application/pdf') return 'Drawing';
  if (name.endsWith('.step') || name.endsWith('.stp')) return 'STEP';
  return 'Other';
}

export function isDrawing(file) {
  return fileKind(file) === 'Drawing';
}

export function statusLabel(key) {
  const known = SHOP_STATUSES.find((s) => s.key === key);
  if (known) return known.label;
  if (key === 'open') return 'Open';
  if (key === 'shipped') return 'Shipped';
  return String(key)
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
