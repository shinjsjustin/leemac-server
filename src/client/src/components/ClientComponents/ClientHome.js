import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import PortalLayout from './PortalLayout';
import PortalMessage from './PortalMessage';
import { listJobs } from '../../api/portalApi';

const PAGE_SIZE = 20;

// Reads the calendar date from the first 10 chars so time zones never shift it.
function formatDate(value) {
    if (!value) return '—';
    const [year, month, day] = String(value).slice(0, 10).split('-').map(Number);
    return `${month}/${day}/${year}`;
}

const partCount = (parts) => `${parts.length} ${parts.length === 1 ? 'part' : 'parts'}`;

const JobCard = ({ job }) => {
    const isShipped = job.status === 'shipped';
    return (
        <Link className="portal-card" to={`/client-job/${job.id}`}>
            <div className="portal-card-row">
                <strong>{job.job_number}</strong>
                <span className={`portal-badge${isShipped ? ' portal-badge--shipped' : ''}`}>
                    {isShipped ? 'Shipped' : 'Open'}
                </span>
            </div>
            <div className="portal-meta">PO: {job.po_number}</div>
            <div className="portal-meta">Due: {formatDate(job.due_date)}</div>
            <div className="portal-meta">Ship: {formatDate(job.ship_date)}</div>
            <div className="portal-meta">{partCount(job.parts)}</div>
        </Link>
    );
};

const ClientHome = () => {
    const [jobs, setJobs] = useState([]);
    const [nextOffset, setNextOffset] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    const loadPage = useCallback(async (offset) => {
        setIsLoading(true);
        const result = await listJobs({ limit: PAGE_SIZE, offset });
        setIsLoading(false);
        if (!result.ok) {
            setError(result.error);
            return;
        }
        setError(null);
        setJobs((previous) => [...previous, ...result.data.jobs]);
        const { hasMore, offset: pageOffset, limit } = result.data.pagination;
        setNextOffset(hasMore ? pageOffset + limit : null);
    }, []);

    useEffect(() => { loadPage(0); }, [loadPage]);

    const isFirstLoad = isLoading && jobs.length === 0;

    return (
        <PortalLayout title="Your jobs">
            {isFirstLoad && <PortalMessage kind="loading" />}
            {error && <PortalMessage kind={error.kind} message={error.message} />}
            {!isLoading && !error && jobs.length === 0 && (
                <>
                    <PortalMessage kind="empty" />
                    <p className="portal-meta">You don't have any jobs with us yet.</p>
                </>
            )}
            {jobs.map((job) => <JobCard key={job.id} job={job} />)}
            {nextOffset !== null && !isLoading && (
                <button type="button" className="portal-button" onClick={() => loadPage(nextOffset)}>
                    Load more
                </button>
            )}
        </PortalLayout>
    );
};

export default ClientHome;
