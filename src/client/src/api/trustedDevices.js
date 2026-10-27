import { apiFetch } from './apiFetch';

const STORAGE_KEY = 'trustedDevice';
const HTTP_FORBIDDEN = 403;

export const getDeviceToken = () => localStorage.getItem(STORAGE_KEY);
export const saveDeviceToken = (raw) => localStorage.setItem(STORAGE_KEY, raw);
export const clearDeviceToken = () => localStorage.removeItem(STORAGE_KEY);

export async function skipWithTrustedBrowser(pendingToken) {
  const deviceToken = getDeviceToken();
  if (!deviceToken) return null;
  const res = await apiFetch('/admin/mfa/trusted', { method: 'POST', body: { pendingToken, deviceToken } });
  if (res.status === HTTP_FORBIDDEN) clearDeviceToken();
  if (!res.ok) return null;
  const data = await res.json();
  return data.token;
}

async function request(path, options) {
  const res = await apiFetch(path, options);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed.');
  return data;
}

const isSelf = (adminId) => adminId === undefined;
const ADMIN_REVOKE_PATH = '/internal/admins/revoke-trusted-devices';

export async function listTrustedBrowsers(adminId) {
  const path = isSelf(adminId)
    ? '/admin/trusted-devices'
    : `/internal/admins/trusted-devices/${adminId}`;
  return (await request(path)).devices;
}

export async function revokeTrustedBrowser(deviceId, adminId) {
  if (isSelf(adminId)) {
    await request(`/admin/trusted-devices/${deviceId}`, { method: 'DELETE' });
    return;
  }
  await request(ADMIN_REVOKE_PATH, {
    method: 'POST',
    body: { adminId: Number(adminId), deviceId: Number(deviceId) },
  });
}

export async function revokeAllTrustedBrowsers(adminId) {
  if (isSelf(adminId)) {
    await request('/admin/trusted-devices', { method: 'DELETE' });
    return;
  }
  await request(ADMIN_REVOKE_PATH, { method: 'POST', body: { adminId: Number(adminId) } });
}
