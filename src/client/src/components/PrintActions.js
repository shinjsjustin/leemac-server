import { useState } from 'react';
import { downloadFile, printFile } from '../api/printApi';

export default function PrintActions({ fileId, filename, kind }) {
  const [isPending, setIsPending] = useState(false);
  const [status, setStatus] = useState('');

  async function print() {
    setIsPending(true);
    setStatus('');
    const result = await printFile(fileId, kind);
    setIsPending(false);
    setStatus(result.ok
      ? `Sent to ${result.data.printer} (${result.data.copies} copies)`
      : result.error.message);
  }

  async function download() {
    const result = await downloadFile(fileId, filename);
    if (!result.ok) setStatus(result.error.message);
  }

  return (
    <>
      <button type="button" onClick={download}>Download PDF</button>
      <button type="button" onClick={print} disabled={isPending}>Print</button>
      <span role="status">{status}</span>
    </>
  );
}
