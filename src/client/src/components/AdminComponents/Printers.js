import React, { useCallback, useEffect, useState } from 'react';
import { jwtDecode } from 'jwt-decode';
import AdminLayout from '../AdminLayout/AdminLayout';
import { listPrinters, savePrinter, testPrint, issueAgentToken } from '../../api/printApi';
import './printers.css';

const EDIT_ACCESS = 3;
const KINDS = ['quote', 'order', 'invoice', 'packing', 'shipping', 'drawing', 'file'];
const ROLES = ['letter', 'label'];
const NEW_PRINTER = {
  name: '', cups_queue: '', role: 'letter', media: 'Letter',
  copies: Object.fromEntries(KINDS.map((kind) => [kind, 1])), enabled: true,
};

const formatTime = (value) => (value ? new Date(value).toLocaleString() : '');

function PrinterForm({ printer, onSaved }) {
  const key = printer.id ?? 'new';
  const [draft, setDraft] = useState({ ...printer, enabled: Boolean(printer.enabled) });
  const [error, setError] = useState('');
  const set = (name, value) => setDraft((d) => ({ ...d, [name]: value }));
  const setCopies = (kind, value) => setDraft((d) => ({ ...d, copies: { ...d.copies, [kind]: Number(value) } }));

  const save = async () => {
    setError('');
    const { id, name, cups_queue, role, media, copies, enabled } = draft;
    const fields = { name, cups_queue, role, media, copies, enabled };
    const result = await savePrinter(id === undefined ? fields : { id, ...fields });
    if (!result.ok) return setError(result.error.message);
    if (id === undefined) setDraft({ ...NEW_PRINTER });
    onSaved();
  };

  return (
    <>
      <input aria-label={`Name ${key}`} value={draft.name} onChange={(e) => set('name', e.target.value)} />
      <input aria-label={`CUPS queue ${key}`} value={draft.cups_queue} onChange={(e) => set('cups_queue', e.target.value)} />
      <select aria-label={`Role ${key}`} value={draft.role} onChange={(e) => set('role', e.target.value)}>
        {ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
      </select>
      <input aria-label={`Paper ${key}`} value={draft.media} onChange={(e) => set('media', e.target.value)} />
      <div className="printers-copies">
        {KINDS.map((kind) => (
          <label key={kind}>{kind}
            <input type="number" min="0" aria-label={`Copies ${kind} ${key}`} value={draft.copies[kind] ?? 1} onChange={(e) => setCopies(kind, e.target.value)} />
          </label>
        ))}
      </div>
      <label><input type="checkbox" aria-label={`Enabled ${key}`} checked={draft.enabled} onChange={(e) => set('enabled', e.target.checked)} /> Enabled</label>
      <button type="button" onClick={save}>{printer.id === undefined ? 'Add printer' : 'Save'}</button>
      {error && <p className="printers-error">{error}</p>}
    </>
  );
}

function PrinterDetails({ printer }) {
  return (
    <dl>
      <dt>Name</dt><dd>{printer.name}</dd>
      <dt>CUPS queue</dt><dd>{printer.cups_queue}</dd>
      <dt>Role</dt><dd>{printer.role}</dd>
      <dt>Paper</dt><dd>{printer.media}</dd>
      <dt>Copies</dt>
      <dd className="printers-copies">{KINDS.map((kind) => <span key={kind}>{`${kind}: ${printer.copies[kind] ?? 1}`}</span>)}</dd>
      <dt>Status</dt><dd>{printer.enabled ? 'Enabled' : 'Disabled'}</dd>
    </dl>
  );
}

function PrinterCard({ printer, canEdit, onSaved }) {
  const [message, setMessage] = useState('');

  const runTest = async () => {
    const result = await testPrint(printer.id);
    setMessage(result.ok ? `Test page sent to ${result.data.printer}` : result.error.message);
  };

  return (
    <section className="printers-card">
      {canEdit ? <PrinterForm printer={printer} onSaved={onSaved} /> : <PrinterDetails printer={printer} />}
      <button type="button" onClick={runTest}>Test print</button>
      {message && <p className="printers-message">{message}</p>}
    </section>
  );
}

export default function Printers() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [token, setToken] = useState('');
  const storedToken = localStorage.getItem('token');
  const canEdit = (storedToken ? jwtDecode(storedToken).access || 0 : 0) >= EDIT_ACCESS;

  const load = useCallback(async () => {
    const result = await listPrinters();
    if (result.ok) setData(result.data);
    else setError(result.error.message);
  }, []);

  useEffect(() => { load(); }, [load]);

  const generateToken = async () => {
    const result = await issueAgentToken();
    if (result.ok) setToken(result.data.token);
    else setError(result.error.message);
  };

  return (
    <AdminLayout current="printers" crumb="System › Printers">
      <div className="printers-page">
        {error && <p className="printers-error">{error}</p>}
        {data && (
          <>
            <p className="printers-agent">Agent last seen: {data.agent.last_seen_at ? formatTime(data.agent.last_seen_at) : 'never'}</p>
            {canEdit && <button type="button" onClick={generateToken}>Generate agent token</button>}
            {token && (
              <div className="printers-token" role="alert">
                <code>{token}</code>
                <p>Copy this token now. It is shown once, and the old token stops working.</p>
                <button type="button" onClick={() => setToken('')}>Dismiss</button>
              </div>
            )}
            {data.printers.map((printer) => (
              <PrinterCard key={printer.id} printer={printer} canEdit={canEdit} onSaved={load} />
            ))}
            {canEdit && <section className="printers-card"><PrinterForm printer={NEW_PRINTER} onSaved={load} /></section>}
            <h2>Recent print jobs</h2>
            <table className="printers-jobs">
              <thead><tr><th>Kind</th><th>Printer</th><th>Copies</th><th>Status</th><th>Error</th><th>Time</th></tr></thead>
              <tbody>
                {data.jobs.map((job) => (
                  <tr key={job.id}>
                    <td>{job.kind}</td><td>{job.printer_name}</td><td>{job.copies}</td>
                    <td>{job.status}</td><td>{job.error}</td><td>{formatTime(job.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
