import { apiFetch } from './apiFetch';

const GENERIC_MESSAGE = 'Something went wrong. Please try again.';
const INVALID_STATUSES = [400, 403, 409];

const failure = (kind, message) => ({ ok: false, error: { kind, message } });
const generic = () => failure('error', GENERIC_MESSAGE);

async function invalidError(response) {
  const body = await response.json().catch(() => null);
  return failure('invalid', typeof body?.error === 'string' && body.error ? body.error : GENERIC_MESSAGE);
}

async function call(path, options) {
  let response;
  try {
    response = await apiFetch(`/internal/share-links${path}`, options);
  } catch {
    return generic();
  }
  if (INVALID_STATUSES.includes(response.status)) return invalidError(response);
  if (!response.ok) return generic();
  return { ok: true, data: await response.json() };
}

const QC = 'qc';

/** companyId is only sent for qc links. */
export function getShareLink(type, targetId, companyId) {
  const query = new URLSearchParams({ type, target_id: targetId });
  if (type === QC) query.set('company_id', companyId);
  return call(`?${query}`);
}

export function createShareLink(type, targetId, companyId) {
  const body = { type, target_id: Number(targetId) };
  if (type === QC) body.company_id = Number(companyId);
  return call('', { method: 'POST', body });
}

export const turnOffShareLink = (id) => call(`/${encodeURIComponent(id)}/turn-off`, { method: 'POST' });
export const listShareCompanies = (partId) => call(`/companies?part_id=${encodeURIComponent(partId)}`);
