import { apiFetch } from './apiFetch';

const DRAWING_ERROR = { kind: 'error', message: 'Something went wrong. Please try again.' };

/** Resolves a blob URL for previewing a drawing via the admin route. The caller revokes it. */
export async function fetchAdminDrawingUrl(file) {
  try {
    const response = await apiFetch(
      `/internal/part/blob/download?fileID=${encodeURIComponent(file.id)}`
    );
    if (!response.ok) return { ok: false, error: DRAWING_ERROR };
    return { ok: true, url: URL.createObjectURL(await response.blob()) };
  } catch (e) {
    console.error('Error fetching drawing:', e);
    return { ok: false, error: DRAWING_ERROR };
  }
}
