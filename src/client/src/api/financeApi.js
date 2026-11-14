import { apiFetch } from './apiFetch';

const GENERIC_MESSAGE = 'Something went wrong. Please try again.';

const failure = (message) => ({ ok: false, error: { message } });

async function errorMessage(response) {
  const body = await response.json().catch(() => null);
  return typeof body?.error === 'string' && body.error ? body.error : GENERIC_MESSAGE;
}

// Runs the request and hands a successful response to `read`; never throws.
async function call(path, options, read = (response) => response.json()) {
  try {
    const response = await apiFetch(path, options);
    if (!response.ok) return failure(await errorMessage(response));
    return { ok: true, data: await read(response) };
  } catch {
    return failure(GENERIC_MESSAGE);
  }
}

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function filterQuery(filter) {
  if (filter?.periodId !== undefined) return `?periodId=${encodeURIComponent(filter.periodId)}`;
  if (filter?.from) return `?from=${encodeURIComponent(filter.from)}&to=${encodeURIComponent(filter.to)}`;
  return '';
}

// The filename is built here because cross-origin pages cannot read Content-Disposition.
export function downloadReport(report, format, filter, label) {
  const filename = `leemac-${report}-${String(label).trim().replace(/\s+/g, '-')}.${format}`;
  const path = `/internal/finances/reports/${report}.${format}${filterQuery(filter)}`;
  return call(path, {}, async (response) => {
    saveBlob(await response.blob(), filename);
    return {};
  });
}

export const setPaidDate = (jobId, paidDate) =>
  call(`/internal/invoices/paid-date/${encodeURIComponent(jobId)}`, {
    method: 'PATCH',
    body: { paid_date: paidDate },
  });
