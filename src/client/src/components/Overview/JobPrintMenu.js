import { useState } from 'react';
import { jobPrintables, printFile, printJobDrawings } from '../../api/printApi';
import './jobPrintMenu.css';

const drawingsMessage = (queued) => {
  if (queued === 0) return 'No drawings to print';
  return `Queued ${queued} ${queued === 1 ? 'drawing' : 'drawings'}`;
};

const stop = (event) => event.stopPropagation();

export default function JobPrintMenu({ jobId }) {
  const [isOpen, setIsOpen] = useState(false);
  const [printables, setPrintables] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [status, setStatus] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  async function toggle() {
    const willOpen = !isOpen;
    setIsOpen(willOpen);
    if (!willOpen || printables || isLoading) return;
    setIsLoading(true);
    const result = await jobPrintables(jobId);
    setIsLoading(false);
    if (result.ok) setPrintables(result.data);
    else setLoadError(result.error.message);
  }

  async function printDocument(document) {
    setStatus('');
    const result = await printFile(document.file_id, document.type);
    setStatus(result.ok ? `Sent to ${result.data.printer}` : result.error.message);
  }

  async function printDrawings() {
    setStatus('');
    const result = await printJobDrawings(jobId);
    setStatus(result.ok ? drawingsMessage(result.data.queued) : result.error.message);
  }

  function onKeyDown(event) {
    event.stopPropagation();
    if (event.key === 'Escape') setIsOpen(false);
  }

  return (
    <span className="jpm-wrap" onClick={stop} onKeyDown={onKeyDown}>
      <button type="button" className="jpm-toggle" aria-label="Job options" aria-expanded={isOpen} onClick={toggle}>⋯</button>
      {isOpen && (
        <div className="jpm-menu" role="menu">
          {isLoading && <span className="jpm-note">Loading…</span>}
          {loadError && <span className="jpm-note">{loadError}</span>}
          {printables && (
            <>
              {printables.documents.map((document) => (
                <button
                  key={document.type}
                  type="button"
                  role="menuitem"
                  disabled={Boolean(document.reason)}
                  onClick={() => printDocument(document)}
                >
                  <span>{document.label}</span>
                  {document.reason && <small>{document.reason}</small>}
                </button>
              ))}
              <button type="button" role="menuitem" disabled={printables.drawings === 0} onClick={printDrawings}>
                <span>Print all part drawings</span>
              </button>
            </>
          )}
          {status && <span className="jpm-note" role="status">{status}</span>}
        </div>
      )}
    </span>
  );
}
