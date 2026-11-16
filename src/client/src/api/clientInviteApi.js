import { apiFetch, tooManyAttemptsMessage } from './apiFetch';

const HTTP_NOT_FOUND = 404;
const HTTP_TOO_MANY = 429;
const NETWORK_ERROR = 'Could not reach the server.';

export async function listCompanies() {
  try {
    const res = await apiFetch('/internal/company/getcompanies');
    if (res.status === HTTP_NOT_FOUND) return { ok: true, companies: [] };
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data.error || 'Could not load companies.' };
    return { ok: true, companies: data };
  } catch {
    return { ok: false, error: NETWORK_ERROR };
  }
}

export async function inviteClient({ email, name, companyId }) {
  try {
    const res = await apiFetch('/client/invite', {
      method: 'POST',
      body: { email, name, company_id: Number(companyId) },
    });
    if (res.status === HTTP_TOO_MANY) return { ok: false, error: tooManyAttemptsMessage(res) };
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data.error || 'Could not send the invite.' };
    return { ok: true, message: data.message };
  } catch {
    return { ok: false, error: NETWORK_ERROR };
  }
}
