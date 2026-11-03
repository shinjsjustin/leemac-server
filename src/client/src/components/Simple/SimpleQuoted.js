import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { jwtDecode } from 'jwt-decode';
import AdminLayout from '../AdminLayout/AdminLayout';
import { listQuoted } from '../../api/simpleJobsApi';
import SimpleJobCard from './SimpleJobCard';
import useSimpleList from './useSimpleList';
import { markNoBid, undoNoBid } from './quotedActions';
import { TERMS, LOCKED_MESSAGE, canMarkNoBid, pageNumbers } from './simpleCard';
import './simple.css';

const readAccess = () => {
  try {
    return jwtDecode(localStorage.getItem('token')).access || 0;
  } catch {
    return 0;
  }
};

export default function SimpleQuoted() {
  const { jobs, extra, page, pages, error, setPage, reload } = useSimpleList(listQuoted);
  const [actionError, setActionError] = useState(null);
  const access = readAccess();
  const isAllowed = canMarkNoBid(access);
  const noBidJobs = extra.no_bid || [];

  const press = (action, jobId) => async () => {
    const result = await action({ jobId, access, reload });
    setActionError(result.ok ? null : result.error.message);
  };

  const lockedNote = !isAllowed && <span className="sm-locked">{LOCKED_MESSAGE}</span>;

  return (
    <AdminLayout current="quoted" crumb={TERMS.quoted}>
      <div className="sm-page" lang="ko">
        {error && <p className="sm-error">{error}</p>}
        {actionError && <p className="sm-error">{actionError}</p>}
        {jobs.map((job) => (
          <SimpleJobCard
            key={job.id}
            job={job}
            onReload={reload}
            actions={(
              <span className="sm-action">
                <button type="button" className="sm-nobid" disabled={!isAllowed} onClick={press(markNoBid, job.id)}>{TERMS.noBid}</button>
                {lockedNote}
              </span>
            )}
          />
        ))}
        <nav className="sm-pages">
          {pageNumbers(page, pages).map((n) => (
            <button key={n} type="button" className={n === page ? 'on' : ''} onClick={() => setPage(n)}>{n}</button>
          ))}
        </nav>
        <details className="sm-nobid-list">
          <summary>{TERMS.noBid} ({noBidJobs.length})</summary>
          {noBidJobs.map((job) => (
            <div className="sm-nobid-row" key={job.id}>
              <Link className="sm-number" to={`/job/${job.id}`}>{job.job_number}</Link>
              <span>{job.company}</span>
              <button type="button" className="sm-nobid" disabled={!isAllowed} onClick={press(undoNoBid, job.id)}>{TERMS.undo}</button>
              {lockedNote}
            </div>
          ))}
        </details>
      </div>
    </AdminLayout>
  );
}
