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

export const printFile = (fileId, kind) =>
  call('/internal/print', { method: 'POST', body: { file_id: fileId, kind } });

export const downloadFile = (fileId, filename) =>
  call(`/internal/part/blob/download?fileID=${encodeURIComponent(fileId)}`, {}, async (response) => {
    saveBlob(await response.blob(), filename);
    return {};
  });

export const listPrinters = () => call('/internal/printers');

export function savePrinter({ id, ...fields }) {
  if (id === undefined) return call('/internal/printers', { method: 'POST', body: fields });
  return call(`/internal/printers/${encodeURIComponent(id)}`, { method: 'PUT', body: fields });
}

export const testPrint = (id) =>
  call(`/internal/printers/${encodeURIComponent(id)}/test`, { method: 'POST' });

export const issueAgentToken = () => call('/internal/printers/agent-token', { method: 'POST' });

export const jobPrintables = (jobId) => call(`/internal/print/job?id=${encodeURIComponent(jobId)}`);

export const printJobDrawings = (jobId) =>
  call('/internal/print/job/drawings', { method: 'POST', body: { job_id: jobId } });
