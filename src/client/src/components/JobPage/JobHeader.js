import React, { useEffect, useState } from 'react';
import { billingState, BILLING_LABELS } from '../Overview/billingState';
import { useIsPhone } from '../Overview/StageControl';
import { canWrite } from '../../config/access';
import EditJobModal from './EditJobModal';
import './jobHeader.css';

const MONEY_LEVEL = 2;
const EXPENSES_LEVEL = 3;
const MS_PER_DAY = 86400000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

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
  job, jobId, expensesTotal, accessLevel, isStarred, onStar, onUnstar, onEdited,
}) {
  const [showEditJobModal, setShowEditJobModal] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const isPhone = useIsPhone();

  useEffect(() => {
    if (!showActions) return undefined;
    const onKeyDown = (e) => { if (e.key === 'Escape') setShowActions(false); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [showActions]);

  const handleEdited = () => {
    setShowEditJobModal(false);
    onEdited();
  };

  const canEdit = canWrite(accessLevel);
  const canSeeExpenses = accessLevel >= EXPENSES_LEVEL;
  const canSeeMoney = accessLevel >= MONEY_LEVEL;

  const bill = billingState(job);

  const runAction = (action) => () => {
    setShowActions(false);
    action();
  };
  const showStar = isStarred || canEdit;
  const toggleStar = isStarred ? onUnstar : onStar;

  return (
    <div className={`jh-hero bill-${bill}`}>
      <div className="jh-h1row">
        <span className="jh-jn">{job.job_number}</span>
        <div className="jh-co">
          <b>{job.company_name}</b>
          <span>{job.attention}</span>
        </div>
        <span className="jh-bill">{BILLING_LABELS[bill]}</span>
        {isStarred && <span className="jh-pill">Starred · on the overview</span>}
        {isPhone ? (
          <div className="jh-right">
            <button
              className="jh-btn"
              aria-label="Job actions"
              aria-expanded={showActions}
              onClick={() => setShowActions((p) => !p)}
            >
              ⋯
            </button>
            {showActions && (
              <div className="jh-menu">
                {canEdit && <button onClick={runAction(() => setShowEditJobModal(true))}>Edit job info</button>}
                {showStar && <button onClick={runAction(toggleStar)}>{isStarred ? 'Unstar' : 'Star'}</button>}
              </div>
            )}
          </div>
        ) : (
          <div className="jh-right">
            {canEdit && <button className="jh-btn" onClick={() => setShowEditJobModal(true)}>Edit job info</button>}
            {showStar && <button className="jh-btn" onClick={toggleStar}>{isStarred ? 'Unstar' : 'Star'}</button>}
          </div>
        )}
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
        {canSeeExpenses && <Fact label="Expenses" value={money(expensesTotal)} />}
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
