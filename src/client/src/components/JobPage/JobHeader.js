import React, { useCallback, useState } from 'react';
import { apiFetch } from '../../api/apiFetch';
import { runJobExport } from '../../api/jobExport';
import EditJobModal from './EditJobModal';
import './jobHeader.css';

const EDIT_LEVEL = 1;
const MONEY_LEVEL = 2;
const EXPORT_LEVEL = 3;
const MS_PER_DAY = 86400000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const EXPORT_TYPES = [
  ['Quote', ['quote']],
  ['Order', ['order']],
  ['Invoice + Packing + Shipping', ['invoice', 'packing', 'shipping']],
];

const money = (n) => (n == null ? '—' : `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

// Reads the YYYY-MM-DD prefix so the shown day never shifts with the viewer's timezone.
const dayParts = (value) => {
  const [y, m, d] = String(value).slice(0, 10).split('-').map(Number);
  return { y, m, d };
};

const shortDate = (value) => {
  if (!value) return '—';
  const { m, d } = dayParts(value);
  return `${d} ${MONTHS[m - 1]}`;
};

function dueText(value) {
  if (!value) return '—';
  const { y, m, d } = dayParts(value);
  const now = new Date();
  const days = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / MS_PER_DAY);
  const unit = Math.abs(days) === 1 ? 'day' : 'days';
  const left = days >= 0 ? `${days} ${unit}` : `${-days} ${unit} overdue`;
  return `${shortDate(value)} · ${left}`;
}

function Fact({ label, value, mono }) {
  return (
    <div className="jh-kv">
      <small>{label}</small>
      <b className={mono ? 'mono' : undefined}>{value}</b>
    </div>
  );
}

export default function JobHeader({
  job, jobId, parts, expensesTotal, accessLevel, isStarred, onStar, onUnstar, onEdited, onFilesChanged,
}) {
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [showEditJobModal, setShowEditJobModal] = useState(false);

  const handleExport = useCallback(async (types) => {
    setShowExportMenu(false);
    setIsExporting(true);
    try {
      const { message, refresh } = await runJobExport(jobId, types);
      alert(message);
      if (refresh) onFilesChanged();
    } finally {
      setIsExporting(false);
    }
  }, [jobId, onFilesChanged]);

  const handlePopulateSheet = useCallback(async () => {
    try {
      const clearResponse = await apiFetch('/internal/sheet/clear', { method: 'POST' });
      if (clearResponse.status !== 200) {
        alert('Failed to clear Google Sheet.');
        return false;
      }
      const populateResponse = await apiFetch('/internal/sheet/populate', { method: 'POST', body: { job, parts } });
      const data = await populateResponse.json();
      if (populateResponse.status === 200) return true;
      console.error(data);
      alert('Failed to populate Google Sheet.');
      return false;
    } catch (e) {
      console.error(e);
      alert('Error occurred while populating Google Sheet.');
      return false;
    }
  }, [job, parts]);

  const handlePopulateSheetClick = useCallback(async () => {
    if (await handlePopulateSheet()) alert('Google Sheet populated successfully!');
  }, [handlePopulateSheet]);

  const handleEdited = () => {
    setShowEditJobModal(false);
    onEdited();
  };

  const canExport = accessLevel >= EXPORT_LEVEL;
  const canSeeMoney = accessLevel >= MONEY_LEVEL;

  return (
    <div className="jh-hero">
      <div className="jh-h1row">
        <span className="jh-jn">{job.job_number}</span>
        <div className="jh-co">
          <b>{job.company_name}</b>
          <span>{job.attention}</span>
        </div>
        {isStarred && <span className="jh-pill">Starred · on the overview</span>}
        <div className="jh-right">
          {accessLevel >= EDIT_LEVEL && <button className="jh-btn" onClick={() => setShowEditJobModal(true)}>Edit job info</button>}
          {canExport && (
            <div className="jh-menu-wrap">
              <button className="jh-btn" onClick={() => setShowExportMenu((p) => !p)} disabled={isExporting}>
                {isExporting ? 'Exporting…' : 'Export ▾'}
              </button>
              {showExportMenu && (
                <div className="jh-menu">
                  {EXPORT_TYPES.map(([label, types]) => (
                    <button key={label} onClick={() => handleExport(types)}>{label}</button>
                  ))}
                </div>
              )}
            </div>
          )}
          {canExport && <button className="jh-btn" onClick={handlePopulateSheetClick}>Populate Google Sheet</button>}
          <button className="jh-btn" onClick={isStarred ? onUnstar : onStar}>{isStarred ? 'Unstar' : 'Star'}</button>
        </div>
      </div>
      <div className="jh-facts">
        <Fact label="Created" value={shortDate(job.created_at)} />
        <Fact label="PO" value={job.po_number || '—'} mono />
        <Fact label="PO date" value={shortDate(job.po_date)} />
        <Fact label="Due" value={dueText(job.due_date)} />
        <Fact label="Invoice" value={job.invoice_number || '—'} mono />
        <Fact label="Invoice date" value={shortDate(job.invoice_date)} />
        {canSeeMoney && <Fact label="Tax code" value={job.tax_code || '—'} mono />}
        {canSeeMoney && <Fact label="Tax" value={job.tax_percent != null ? `${job.tax_percent}%` : '—'} />}
        {canSeeMoney && <Fact label="Subtotal" value={money(job.subtotal)} />}
        {canExport && <Fact label="Expenses" value={money(expensesTotal)} />}
        {canSeeMoney && <Fact label="Total" value={money(job.total_cost)} />}
      </div>
      {showEditJobModal && (
        <EditJobModal
          job={job}
          jobId={jobId}
          accessLevel={accessLevel}
          onClose={() => setShowEditJobModal(false)}
          onEdited={handleEdited}
        />
      )}
    </div>
  );
}
