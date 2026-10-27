import { apiFetch } from './apiFetch';

export const TYPE_LABELS = {
  quote: 'Quote',
  order: 'Order',
  invoice: 'Invoice',
  packing: 'Packing List',
  shipping: 'Shipping',
};

const UNREACHABLE = { ok: false, refresh: false, message: 'Export failed: could not reach the server' };

const label = (type) => TYPE_LABELS[type] || type;

function resultLine({ type, fileId, filename }) {
  if (fileId) return `${label(type)} saved to job files as ${filename}`;
  return `${label(type)} exported, but no PDF came back (old export script), so nothing was saved`;
}

/** Pure: turns the server status and JSON body into { ok, refresh, message }. */
export function exportMessage(status, body) {
  const results = body.results || [];
  const skipped = body.skipped || [];
  const lines = results.map(resultLine);
  const ok = status >= 200 && status < 300;

  if (!ok) {
    lines.push(body.failedType
      ? `${label(body.failedType)} failed: ${body.error}`
      : `Export failed: ${body.error}`);
    if (skipped.length) lines.push(`Not run: ${skipped.map(label).join(', ')}`);
  }

  return { ok, refresh: results.some((r) => r.fileId), message: lines.join('\n') };
}

/** Runs the exports on the server. Never throws. */
export async function runJobExport(jobId, types) {
  try {
    const res = await apiFetch(`/internal/job/export?id=${jobId}`, { method: 'POST', body: { types } });
    return exportMessage(res.status, await res.json());
  } catch {
    return UNREACHABLE;
  }
}
