import React from 'react';
import AdminLayout from '../AdminLayout/AdminLayout';
import { listOverview } from '../../api/simpleJobsApi';
import SimpleJobCard from './SimpleJobCard';
import useSimpleList from './useSimpleList';
import { TERMS, pageNumbers } from './simpleCard';
import './simple.css';

export default function SimpleOverview() {
  const { jobs, page, pages, error, setPage, reload } = useSimpleList(listOverview);

  return (
    <AdminLayout current="simple-overview" crumb={TERMS.overview}>
      <div className="sm-page" lang="ko">
        {error && <p className="sm-error">{error}</p>}
        {jobs.map((job) => <SimpleJobCard key={job.id} job={job} onReload={reload} />)}
        <nav className="sm-pages">
          {pageNumbers(page, pages).map((n) => (
            <button key={n} type="button" className={n === page ? 'on' : ''} onClick={() => setPage(n)}>{n}</button>
          ))}
        </nav>
      </div>
    </AdminLayout>
  );
}
