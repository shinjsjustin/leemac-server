import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import PortalLayout from './PortalLayout';
import PortalMessage from './PortalMessage';
import PortalField from './PortalField';
import { listJobs, formatDate } from '../../api/portalApi';

const PAGE_SIZE = 20;

const partCount = (parts) => `${parts.length} ${parts.length === 1 ? 'part' : 'parts'}`;

const JobCard = ({ job }) => {
    const isShipped = job.status === 'shipped';
    const statusText = isShipped ? 'Shipped' : 'Open';
    return (
        <Link className="portal-card" to={`/client-job/${job.id}`}
              aria-label={`Job ${job.job_number}, ${statusText}`}>
            <div className="portal-card-row">
                <strong>{job.job_number}</strong>
                <span className={`portal-badge${isShipped ? ' portal-badge--shipped' : ''}`}>
                    {statusText}
                </span>
            </div>
            <div className="portal-fields">
                <PortalField label="PO" value={job.po_number} />
                <PortalField label="Due" value={job.due_date}>{formatDate(job.due_date)}</PortalField>
                <PortalField label="Ship" value={job.ship_date}>{formatDate(job.ship_date)}</PortalField>
            </div>
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
                <PortalMessage kind="empty" message="You don't have any jobs with us yet." />
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
