import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AdminLayout from '../AdminLayout/AdminLayout';
import { apiFetch } from '../../api/apiFetch';
import OverviewSchedule from '../ClientComponents/OverviewSchedule';
import PartRow from './PartRow';
import StageBoard from './StageBoard';
import { useIsPhone } from './StageControl';
import useStageActions from './useStageActions';
import { billingState, BILLING_LABELS } from './billingState';
import { STAGES, stageOfStatus } from './overviewStages';
import './overview.css';
import './stageBoard.css';
import './adminSchedule.css';

const money = (n) => `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const BAND = [
  { field: 'active_parts', label: 'Active parts', tone: 'g', format: (v) => v },
  { field: 'open_value', label: 'Open value', tone: 'b', format: money },
  { field: 'due_soon', label: 'Due this week', tone: 'a', format: (v) => v },
  { field: 'overdue', label: 'Overdue', tone: 'r', format: (v) => v },
  { field: 'invoices_waiting', label: 'Invoices waiting', tone: 'b', format: (v) => v.count, sub: (v) => `${money(v.total)} unpaid` },
];

const mapParts = (data, transform) => ({
  ...data,
  jobs: data.jobs.map((job) => ({ ...job, parts: transform(job.parts) })),
});

export default function Overview() {
  const [data, setData] = useState(null);
  const [schedule, setSchedule] = useState(null);
  const [error, setError] = useState(null);
  const [stage, setStage] = useState(null);
  const [contact, setContact] = useState(null);
  const [view, setView] = useState('list');
  const navigate = useNavigate();

  const isPhone = useIsPhone();

  const load = useCallback(() => {
    apiFetch('/internal/job/overview')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('Failed to load overview'))))
      .then(setData)
      .catch((e) => setError(e.message));
    // The schedule is optional: a failure just leaves the panel out.
    apiFetch('/internal/job/schedule')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('Failed to load schedule'))))
      .then((body) => (Array.isArray(body.board) ? setSchedule(body) : Promise.reject(new Error('Malformed schedule'))))
      .catch(() => setSchedule(null));
  }, []);

  useEffect(load, [load]);

  const patchPart = useCallback((jobPartId, patch) => {
    setData((prev) => mapParts(prev, (parts) => parts.map((p) => (p.job_part_id === jobPartId ? { ...p, ...patch } : p))));
  }, []);

  const actions = useStageActions((jobPartId, patch) => {
    patchPart(jobPartId, patch);
    load();
  });
  const { toast, dismiss } = actions;

  const unstar = async (jobPartId) => {
    try {
      const res = await apiFetch('/internal/job/unstarjob', { method: 'DELETE', body: { jobPartId } });
      if (!res.ok) throw new Error((await res.json()).error || 'Request failed');
      setData((prev) => mapParts(prev, (parts) => parts.filter((p) => p.job_part_id !== jobPartId)));
    } catch (e) {
      actions.fail(`Could not unstar: ${e.message}`);
    }
  };

  let body;
  if (error) body = <p className="ov-error">{error}</p>;
  else if (!data) body = <p>Loading…</p>;
  else {
    const contactJobs = data.jobs.map((job) => ({ ...job, parts: job.parts.filter((p) => contact === null || p.attention === contact) }));
    const allParts = contactJobs.flatMap((job) => job.parts);
    const counts = STAGES.map((_, i) => allParts.filter((p) => stageOfStatus(p.status) === i).length);
    const jobs = contactJobs
      .map((job) => ({ ...job, parts: job.parts.filter((p) => stage === null || stageOfStatus(p.status) === stage) }))
      .filter((job) => job.parts.length > 0);

    const shownIds = new Set(jobs.map((job) => job.id));
    const isShown = (job) => shownIds.has(job.id);
    const schedulePanel = schedule && (
      <div className="ov-sched">
        <OverviewSchedule
          schedule={{ ...schedule, board: schedule.board.filter(isShown), undated: (schedule.undated || []).filter(isShown) }}
          now={new Date()}
          jobPath={(id) => `/job/${id}`}
        />
      </div>
    );

    body = (
      <div className="ov-page">
        <div className="ov-band">
          {BAND.filter(({ field }) => data.headline[field] !== undefined).map(({ field, label, tone, format, sub }) => (
            <div className={`ov-tile ${tone}`} key={field}>
              <b>{format(data.headline[field])}</b>
              <div className="l">{label}{sub && <small>{sub(data.headline[field])}</small>}</div>
            </div>
          ))}
        </div>
        <div className="ov-contacts">
          <span className="lbl">Contact</span>
          <button type="button" className={`cf${contact === null ? ' on' : ''}`} onClick={() => setContact(null)}>All</button>
          {data.contacts.map(({ attention, count }) => (
            <button
              key={attention}
              type="button"
              className={`cf${contact === attention ? ' on' : ''}`}
              onClick={() => setContact(contact === attention ? null : attention)}
            >
              {attention} <i>{count}</i>
            </button>
          ))}
        </div>
        <div className="ov-strip">
          {STAGES.map((s, i) => (
            <button
              key={s.key}
              type="button"
              className={`${counts[i] ? '' : 'zero'}${stage === i ? ' on' : ''}`}
              style={{ '--sc': `var(--s-${s.key})` }}
              onClick={() => setStage(stage === i ? null : i)}
            >
              <span>{s.label}</span>
              <b>{counts[i]}<small>{s.ko}</small></b>
            </button>
          ))}
        </div>
        {schedulePanel}
        {view === 'board' && <StageBoard jobs={jobs} onOpenJob={(id) => navigate(`/job/${id}`)} />}
        {view === 'list' && jobs.map((job) => {
          const bill = billingState(job);
          const openJob = () => navigate(`/job/${job.id}`);
          return (
          <section className={`ov-job bill-${bill}`} key={job.id}>
            <header
              role="link"
              tabIndex={0}
              onClick={openJob}
              onKeyDown={(e) => { if (e.key === 'Enter') openJob(); }}
            >
              <span className="no">{job.job_number}</span>
              <span className="who"><b>{job.company_name}</b> <span>{job.attention}</span></span>
              <span className="ov-bill">{BILLING_LABELS[bill]}</span>
              <span className="po">{job.po_number}</span>
            </header>
            {job.parts.map((p) => (
              <PartRow key={p.job_part_id} part={p} jobId={job.id} actions={actions} onUnstar={unstar} onChanged={load} />
            ))}
          </section>
          );
        })}
      </div>
    );
  }

  const toggle = (
    <div className="ov-toggle">
      {[['list', 'List'], ['board', 'Stage board']].map(([key, label]) => (
        <button key={key} type="button" className={view === key ? 'on' : ''} onClick={() => setView(key)}>{label}</button>
      ))}
    </div>
  );

  return (
    <AdminLayout current="overview" crumb="Overview" actions={toggle}>
      {body}
      {isPhone && (
        <nav className="ov-tabbar">
          <Link to="/starred-jobs">Overview</Link>
          <Link to="/joblist">Jobs</Link>
          <Link to="/shop-update" className="scan">Scan</Link>
          <Link to="/notelist">Notes</Link>
        </nav>
      )}
      {toast && (
        <div className={`ov-toast ${toast.kind}`}>
          <span className="msg">
            {toast.message}
            {toast.undo && <> · <button type="button" onClick={toast.undo}>Undo</button></>}
          </span>
          <button type="button" className="x" aria-label="Dismiss" onClick={dismiss}>×</button>
        </div>
      )}
    </AdminLayout>
  );
}
